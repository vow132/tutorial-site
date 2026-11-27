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
import { safeAdminFrom } from "@/lib/admin-redirect";
import { audit } from "@/lib/audit";
import { getClientIp } from "@/lib/client-ip";
import { passwordProblem } from "@/lib/password-policy";
import { sharedLimiter, type RateLimiter } from "@/lib/rate-limit";
import { verifySecondFactor } from "@/lib/second-factor";
import { isDemoMode } from "@/lib/demo";
import { verifyHuman } from "@/lib/turnstile-store";
import { getAdminI18n } from "@/lib/i18n/server";

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


export async function login(
  _prev: LoginState,
  formData: FormData
): Promise<LoginState> {
  const username = String(formData.get("username") ?? "").trim().slice(0, 64);
  const password = String(formData.get("password") ?? "").slice(0, 1024);
  const totp = String(formData.get("totp") ?? "").trim();
  const showTotp = formData.has("totp");
  const from = safeAdminFrom(String(formData.get("from") ?? ""));
  const { m, plural } = await getAdminI18n();
  const t = m.admin.login;

  if (!username || !password) {
    return { error: t.missingCredentials, needsTotp: showTotp };
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
      error: plural(Math.ceil(wait / 60), m.admin.tooManyAttempts),
      needsTotp: showTotp,
    };
  }

  // 开启了人机验证时先核对令牌（每次提交都要，两步验证那一步也一样）；没通过不算一次密码错误
  const human = await verifyHuman(formData.get("turnstileToken"), "login");
  if (!human.ok) return { error: t.humanCheckFailed, needsTotp: showTotp };

  const fail = async (action: string) => {
    for (const [limiter, key] of buckets) limiter.hit(key);
    await audit(action, { actor: username, detail: device ? m.admin.auditDetail.trustedDevice : m.admin.auditDetail.unknownDevice });
    // 这一次失败让某个计数器触发了锁定：记一条日志并推送告警（每次锁定只会触发一次）。
    const locked = buckets.filter(([limiter, key]) => limiter.retryAfter(key) > 0).map(([limiter]) => limiter);
    if (locked.length > 0) {
      const d = m.admin.auditDetail;
      const scope = locked
        .map((limiter) =>
          limiter === limiters.device ? d.lockDevice
          : limiter === limiters.account ? d.lockAccount
          : limiter === limiters.ip ? d.lockIp
          : d.lockGlobal,
        )
        .join(d.listSeparator);
      await audit("login.locked", { actor: username, detail: scope });
    }
  };

  const admin = await prisma.admin.findUnique({ where: { username } });
  const valid = await bcrypt.compare(password, admin?.password ?? DUMMY_HASH);
  if (!admin || !valid) {
    await fail("login.failed");
    return { error: t.wrongCredentials, needsTotp: showTotp };
  }

  let recoveryCodesLeft: number | null = null;
  if (admin.totpSecret) {
    if (!totp) return { needsTotp: true };
    // 6 位验证码或一次性恢复码；同一个码并发重放时只有一个请求能成功。
    const factor = await verifySecondFactor(admin, totp);
    if (!factor.ok) {
      await fail("login.totp_failed");
      return {
        error: factor.reason === "locked" ? t.totpLocked : t.wrongSecondFactor,
        needsTotp: true,
      };
    }
    if (factor.method === "recovery") recoveryCodesLeft = factor.remaining;
  }

  for (const [limiter, key] of buckets) {
    if (limiter !== limiters.global) limiter.reset(key);
  }

  await startAdminSession(admin);
  await rememberDevice(admin.username, device);
  await audit("login.success", {
    actor: admin.username,
    detail: device ? m.admin.auditDetail.trustedDevice : m.admin.auditDetail.newDevice,
    alert: !device,
  });
  if (recoveryCodesLeft !== null) {
    await audit("login.recovery_code", { actor: admin.username, detail: plural(recoveryCodesLeft, m.admin.auditDetail.recoveryLeft) });
  }

  // 仍在使用默认/弱密码时，直接带去改密码页面。
  // 演示站的密码本来就是公开的（lib/demo.ts），不用提示改密码
  redirect(!isDemoMode() && passwordProblem(password, admin.username, m.admin.password) ? "/admin/account?weak=1" : from);
}

export async function logout() {
  const current = await getCurrentSession();
  await endCurrentSession();
  if (current) await audit("logout", { actor: current.admin.username });
  redirect("/admin/login");
}
