import { randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import { cache } from "react";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getClientIp, getUserAgent } from "@/lib/client-ip";
import { sharedLimiter } from "@/lib/rate-limit";
import {
  credentialFingerprint,
  DEVICE_COOKIE,
  DEVICE_MAX_AGE_SECONDS,
  readDevice,
  readSession,
  SESSION_COOKIE,
  SESSION_MAX_AGE_SECONDS,
  signDevice,
  signSession,
} from "@/lib/session";

/**
 * Secure 标记：SESSION_COOKIE_SECURE 显式设置时以它为准；未设置时
 * 根据浏览器是否经 HTTPS 访问自动判断，HTTPS 站点默认就带 Secure。
 */
async function secureCookies(): Promise<boolean> {
  const configured = process.env.SESSION_COOKIE_SECURE;
  if (configured === "true") return true;
  if (configured === "false") return false;
  const store = await headers();
  const proto = store.get("x-forwarded-proto")?.split(",")[0]?.trim();
  return proto === "https" || (store.get("origin") ?? "").startsWith("https://");
}

async function cookieOptions(maxAge: number, path = "/") {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: await secureCookies(),
    path,
    maxAge,
  };
}

type AdminCredentials = { id: number; username: string; password: string };

/** Create a revocable server-side session and set its signed cookie. */
export async function startAdminSession(admin: AdminCredentials) {
  const id = randomBytes(24).toString("base64url");
  const now = Date.now();
  await prisma.adminSession.deleteMany({ where: { expiresAt: { lt: new Date(now) } } });
  await prisma.adminSession.create({
    data: {
      id,
      adminId: admin.id,
      userAgent: await getUserAgent(),
      ip: await getClientIp(),
      expiresAt: new Date(now + SESSION_MAX_AGE_SECONDS * 1000),
    },
  });
  const store = await cookies();
  store.set(
    SESSION_COOKIE,
    signSession(admin.username, admin.password, id),
    await cookieOptions(SESSION_MAX_AGE_SECONDS),
  );
  return id;
}

/** Re-sign the current session after a username/password change. */
export async function refreshSessionCookie(admin: AdminCredentials, sessionId: string) {
  const store = await cookies();
  store.set(
    SESSION_COOKIE,
    signSession(admin.username, admin.password, sessionId),
    await cookieOptions(SESSION_MAX_AGE_SECONDS),
  );
}

export async function endCurrentSession() {
  const store = await cookies();
  const session = readSession(store.get(SESSION_COOKIE)?.value);
  if (session) await prisma.adminSession.deleteMany({ where: { id: session.sid } });
  store.delete(SESSION_COOKIE);
}

/** Resolve the administrator and session row behind the signed cookie. */
export const getCurrentSession = cache(async function getCurrentSession() {
  const store = await cookies();
  const token = readSession(store.get(SESSION_COOKIE)?.value);
  if (!token) return null;

  const session = await prisma.adminSession.findUnique({
    where: { id: token.sid },
    include: { admin: true },
  });
  if (!session || session.expiresAt.getTime() <= Date.now()) return null;

  const { admin } = session;
  // Require the credential fingerprint so password changes revoke every older session.
  if (admin.username !== token.sub || token.cv !== credentialFingerprint(admin.password)) {
    return null;
  }
  return { admin, sessionId: session.id };
});

export async function getCurrentAdmin() {
  return (await getCurrentSession())?.admin ?? null;
}

export async function requireAuth() {
  const admin = await getCurrentAdmin();
  if (!admin) throw new Error("未登录或会话已过期");
  return admin;
}

/**
 * 后台页面用：layout 在客户端导航时不一定重新执行，所以每个读取后台数据的
 * 页面都自己校验一次（同一次渲染内由 React cache 去重，不会多查库）。
 */
export async function requireAdminPage() {
  const admin = await getCurrentAdmin();
  if (!admin) redirect("/admin/login");
  return admin;
}

export async function requireSession() {
  const current = await getCurrentSession();
  if (!current) throw new Error("未登录或会话已过期");
  return current;
}

/**
 * "受信任设备"：成功登录过的浏览器会拿到一个签名 Cookie，登录限流对它
 * 单独计数，这样攻击者刷错密码只能锁住陌生设备，锁不住管理员常用的浏览器。
 */
export async function readTrustedDevice(username: string): Promise<string | null> {
  const store = await cookies();
  return readDevice(store.get(DEVICE_COOKIE)?.value, username);
}

export async function rememberDevice(username: string, deviceId?: string | null) {
  const store = await cookies();
  store.set(
    DEVICE_COOKIE,
    signDevice(username, deviceId || randomBytes(16).toString("base64url")),
    await cookieOptions(DEVICE_MAX_AGE_SECONDS, "/admin"),
  );
}

/** 已登录状态下再次确认密码（防止被盗会话直接改密、关两步验证或部署）同样要限流。 */
const confirmLimiter = sharedLimiter("account:confirm", 5, 15 * 60 * 1000);

/** 返回错误文案；密码正确时返回 null。 */
export async function confirmCurrentPassword(
  admin: { id: number; password: string },
  password: string,
): Promise<string | null> {
  const key = String(admin.id);
  const wait = confirmLimiter.retryAfter(key);
  if (wait > 0) return `尝试次数过多，请约 ${Math.ceil(wait / 60)} 分钟后再试`;
  if (!password || !(await bcrypt.compare(password.slice(0, 1024), admin.password))) {
    confirmLimiter.hit(key);
    return "当前密码不正确";
  }
  confirmLimiter.reset(key);
  return null;
}
