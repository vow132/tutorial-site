"use server";

import { redirect } from "next/navigation";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import {
  endCurrentSession,
  getCurrentSession,
  readTrustedDevice,
  rememberDevice,
  startAdminSession,
} from "@/lib/admin-auth";
import { audit } from "@/lib/audit";
import { getClientIp } from "@/lib/client-ip";
import { passwordProblem } from "@/lib/password-policy";
import { sharedLimiter, type RateLimiter } from "@/lib/rate-limit";
import { verifyTotp } from "@/lib/totp";

export type LoginState = { error?: string; needsTotp?: boolean };

const FIFTEEN_MINUTES = 15 * 60 * 1000;

/**
 * 只统计失败次数，分层限流：
 * - 受信任设备（之前在这个浏览器登录成功过）单独计数，攻击者锁不住它；
 * - 陌生设备按用户名、IP（配置了 TRUST_PROXY 时）和全局总量计数。
 *   全局上限同时限制了 bcrypt 的 CPU 消耗和限流表的增长速度。
 */
const limiters = {
  device: sharedLimiter("login:device", 5, FIFTEEN_MINUTES),
  account: sharedLimiter("login:account", 10, FIFTEEN_MINUTES),
  ip: sharedLimiter("login:ip", 20, FIFTEEN_MINUTES),
  global: sharedLimiter("login:global", 100, 5 * 60 * 1000, 1),
};

/** 用户名不存在时也跑一次同等成本的 bcrypt，避免用响应时间探测用户名。 */
const DUMMY_HASH = "$2b$12$jJ8casc00woJP55PFB44IejGXBvuES90KswhYW0Z7AURyigQm1stK";

/** 只允许站内 /admin 路径，防止 open redirect。 */
function safeAdminFrom(raw: string | undefined): string {
  if (raw && /^\/admin(?:\/|$)/.test(raw) && !raw.startsWith("/admin//")) {
    return raw;
  }
  return "/admin";
}

export async function login(
  _prev: LoginState,
  formData: FormData
): Promise<LoginState> {
  const username = String(formData.get("username") ?? "").trim().slice(0, 64);
  const password = String(formData.get("password") ?? "").slice(0, 1024);
  const totp = String(formData.get("totp") ?? "").trim();
  const showTotp = formData.has("totp");
  const from = safeAdminFrom(String(formData.get("from") ?? ""));

  if (!username || !password) {
    return { error: "请输入用户名和密码", needsTotp: showTotp };
  }

  const ip = await getClientIp();
  const device = await readTrustedDevice(username);
  const buckets: Array<[RateLimiter, string]> = device
    ? [[limiters.device, device]]
    : [
        [limiters.account, username.toLowerCase()],
        [limiters.global, "untrusted"],
        ...(ip ? [[limiters.ip, ip] as [RateLimiter, string]] : []),
      ];

  const wait = Math.max(...buckets.map(([limiter, key]) => limiter.retryAfter(key)));
  if (wait > 0) {
    return {
      error: `尝试次数过多，请约 ${Math.ceil(wait / 60)} 分钟后再试`,
      needsTotp: showTotp,
    };
  }

  const fail = async (action: string) => {
    for (const [limiter, key] of buckets) limiter.hit(key);
    await audit(action, { actor: username, detail: device ? "受信任设备" : "陌生设备" });
  };

  const admin = await prisma.admin.findUnique({ where: { username } });
  const valid = await bcrypt.compare(password, admin?.password ?? DUMMY_HASH);
  if (!admin || !valid) {
    await fail("login.failed");
    return { error: "用户名或密码错误", needsTotp: showTotp };
  }

  if (admin.totpSecret) {
    if (!totp) return { needsTotp: true };
    const step = verifyTotp(admin.totpSecret, totp, admin.totpLastStep);
    // 条件更新：同一个验证码并发重放时只有一个请求能赢。
    const accepted =
      step !== null &&
      (
        await prisma.admin.updateMany({
          where: {
            id: admin.id,
            OR: [{ totpLastStep: null }, { totpLastStep: { lt: step } }],
          },
          data: { totpLastStep: step },
        })
      ).count === 1;
    if (!accepted) {
      await fail("login.totp_failed");
      return { error: "两步验证码不正确或已被使用", needsTotp: true };
    }
  }

  for (const [limiter, key] of buckets) {
    if (limiter !== limiters.global) limiter.reset(key);
  }

  await startAdminSession(admin);
  await rememberDevice(admin.username, device);
  await audit("login.success", {
    actor: admin.username,
    detail: device ? "受信任设备" : "新设备",
  });

  // 仍在使用默认/弱密码时，直接带去改密码页面。
  redirect(passwordProblem(password, admin.username) ? "/admin/account?weak=1" : from);
}

export async function logout() {
  const current = await getCurrentSession();
  await endCurrentSession();
  if (current) await audit("logout", { actor: current.admin.username });
  redirect("/admin/login");
}
