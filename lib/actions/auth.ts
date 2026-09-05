"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import {
  SESSION_COOKIE,
  SESSION_MAX_AGE_SECONDS,
  signSession,
} from "@/lib/session";
import { rateLimit, resetRateLimit } from "@/lib/rate-limit";

export type LoginState = { error?: string };

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
  const username = String(formData.get("username") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const from = safeAdminFrom(String(formData.get("from") ?? ""));

  if (!username || !password) {
    return { error: "请输入用户名和密码" };
  }

  // 登录限流：同一用户名 15 分钟内最多 5 次失败尝试
  const limit = rateLimit(`login:${username}`, 5, 15 * 60 * 1000);
  if (!limit.ok) {
    return {
      error: `尝试次数过多，请约 ${Math.ceil(limit.retryAfterSeconds / 60)} 分钟后再试`,
    };
  }

  const admin = await prisma.admin.findUnique({ where: { username } });
  const valid = admin ? await bcrypt.compare(password, admin.password) : false;
  if (!admin || !valid) {
    return { error: "用户名或密码错误" };
  }

  resetRateLimit(`login:${username}`);

  const store = await cookies();
  store.set(SESSION_COOKIE, signSession(admin.username, admin.password), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.SESSION_COOKIE_SECURE === "true",
    path: "/",
    maxAge: SESSION_MAX_AGE_SECONDS,
  });

  redirect(from);
}

export async function logout() {
  const store = await cookies();
  store.delete(SESSION_COOKIE);
  redirect("/admin/login");
}
