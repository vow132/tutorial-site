"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
  type AuthenticationResponseJSON,
  type PublicKeyCredentialCreationOptionsJSON,
  type PublicKeyCredentialRequestOptionsJSON,
  type RegistrationResponseJSON,
} from "@simplewebauthn/server";
import { prisma } from "@/lib/prisma";
import {
  confirmCurrentPassword,
  readTrustedDevice,
  rememberDevice,
  requireSession,
  startAdminSession,
} from "@/lib/admin-auth";
import { safeAdminFrom } from "@/lib/admin-redirect";
import { audit } from "@/lib/audit";
import { getClientIp } from "@/lib/client-ip";
import {
  MAX_PASSKEYS,
  decodeTransports,
  encodeTransports,
  relyingParty,
  storePasskeyChallenge,
  takePasskeyChallenge,
} from "@/lib/passkeys";
import { sharedLimiter } from "@/lib/rate-limit";
import { getSettings } from "@/lib/settings";
import { isDemoMode } from "@/lib/demo";
import { getAdminI18n } from "@/lib/i18n/server";
import { format } from "@/lib/i18n/format";

type Result = { error?: string; success?: string };

/** 登记新通行密钥第一步：确认当前密码（防止被盗会话偷偷加一把“后门钥匙”），返回浏览器要用的参数。 */
export async function beginPasskeyRegistration(
  rawName: string,
  currentPassword: string,
): Promise<Result & { options?: PublicKeyCredentialCreationOptionsJSON }> {
  const { m, f } = await getAdminI18n();
  const t = m.admin.passkeys;
  if (isDemoMode()) return { error: m.admin.demoReadOnly };
  const { admin } = await requireSession("account");
  const rp = relyingParty();
  if ("error" in rp) return { error: t[rp.error] };

  const name = String(rawName ?? "").trim().slice(0, 40);
  if (!name) return { error: t.nameRequired };
  const passwordError = await confirmCurrentPassword(admin, String(currentPassword ?? ""));
  if (passwordError) return { error: passwordError };

  const existing = await prisma.adminPasskey.findMany({
    where: { adminId: admin.id },
    select: { id: true, transports: true },
  });
  if (existing.length >= MAX_PASSKEYS) return { error: f(t.tooMany, { n: MAX_PASSKEYS }) };

  const { siteName } = await getSettings();
  const options = await generateRegistrationOptions({
    rpName: siteName,
    rpID: rp.rpID,
    userName: admin.username,
    userID: new TextEncoder().encode(`admin-${admin.id}`),
    attestationType: "none",
    excludeCredentials: existing.map((item) => ({ id: item.id, transports: decodeTransports(item.transports) })),
    // 可发现凭据：登录时不用输入用户名；必须验证指纹/面容/PIN，才能替代密码 + 两步验证。
    authenticatorSelection: { residentKey: "required", userVerification: "required" },
  });
  await storePasskeyChallenge("register", options.challenge, { adminId: admin.id, name });
  return { options };
}

/** 登记新通行密钥第二步：校验浏览器返回的凭据并保存公钥。 */
export async function finishPasskeyRegistration(response: RegistrationResponseJSON): Promise<Result> {
  const { admin } = await requireSession("account");
  const { m, f } = await getAdminI18n();
  const t = m.admin.passkeys;
  const rp = relyingParty();
  if ("error" in rp) return { error: t[rp.error] };
  const challenge = await takePasskeyChallenge("register");
  if (!challenge || challenge.adminId !== admin.id) return { error: t.expired };

  let verification;
  try {
    verification = await verifyRegistrationResponse({
      response,
      expectedChallenge: challenge.challenge,
      expectedOrigin: rp.origin,
      expectedRPID: rp.rpID,
      requireUserVerification: true,
    });
  } catch (error) {
    return { error: f(t.verifyFailedWithReason, { reason: error instanceof Error ? error.message : t.unknownError }) };
  }
  if (!verification.verified) return { error: t.verifyFailed };

  const { credential, credentialBackedUp } = verification.registrationInfo;
  const name = challenge.name ?? t.defaultName;
  await prisma.adminPasskey.create({
    data: {
      id: credential.id,
      adminId: admin.id,
      publicKey: Buffer.from(credential.publicKey),
      counter: credential.counter,
      transports: encodeTransports(credential.transports),
      name,
      backedUp: credentialBackedUp,
    },
  });
  await audit("passkey.add", { actor: admin.username, detail: name });
  revalidatePath("/admin/account");
  revalidatePath("/admin/login");
  return { success: f(t.added, { name }) };
}

export async function removePasskey(id: string): Promise<Result> {
  const { m, f } = await getAdminI18n();
  const t = m.admin.passkeys;
  if (isDemoMode()) return { error: m.admin.demoReadOnly };
  const { admin } = await requireSession("account");
  const passkey = await prisma.adminPasskey.findFirst({ where: { id: String(id), adminId: admin.id } });
  if (!passkey) return { error: t.notFound };
  await prisma.adminPasskey.delete({ where: { id: passkey.id } });
  await audit("passkey.remove", { actor: admin.username, detail: passkey.name });
  revalidatePath("/admin/account");
  revalidatePath("/admin/login");
  return { success: f(t.removed, { name: passkey.name }) };
}

/**
 * 通行密钥登录失败也要限流：全站 15 分钟最多 30 次，配置了 TRUST_PROXY 时
 * 单个 IP 最多 10 次。签名验证本身很便宜，这里主要是防止刷日志和告警。
 */
const loginLimiters = {
  global: sharedLimiter("login:passkey", 30, 15 * 60 * 1000, 1),
  ip: sharedLimiter("login:passkey-ip", 10, 15 * 60 * 1000),
};

async function passkeyLoginWait(ip: string | null) {
  return Math.max(
    loginLimiters.global.retryAfter("all"),
    ip ? loginLimiters.ip.retryAfter(ip) : 0,
  );
}

/** 通行密钥登录第一步：不需要用户名（可发现凭据），由浏览器列出本站的通行密钥。 */
export async function beginPasskeyLogin(): Promise<Result & { options?: PublicKeyCredentialRequestOptionsJSON }> {
  const { m, plural } = await getAdminI18n();
  const t = m.admin.passkeys;
  const rp = relyingParty();
  if ("error" in rp) return { error: t[rp.error] };
  const wait = await passkeyLoginWait(await getClientIp());
  if (wait > 0) return { error: plural(Math.ceil(wait / 60), m.admin.tooManyAttempts) };
  const options = await generateAuthenticationOptions({ rpID: rp.rpID, userVerification: "required" });
  await storePasskeyChallenge("login", options.challenge);
  return { options };
}

/** 通行密钥登录第二步：验证签名后建立会话。通行密钥已含设备持有 + 生物识别/PIN，不再要求两步验证码。 */
export async function finishPasskeyLogin(response: AuthenticationResponseJSON, from?: string): Promise<Result> {
  const { m, plural } = await getAdminI18n();
  const t = m.admin.passkeys;
  const rp = relyingParty();
  if ("error" in rp) return { error: t[rp.error] };
  const ip = await getClientIp();
  const wait = await passkeyLoginWait(ip);
  if (wait > 0) return { error: plural(Math.ceil(wait / 60), m.admin.tooManyAttempts) };

  const fail = async (detail: string) => {
    loginLimiters.global.hit("all");
    if (ip) loginLimiters.ip.hit(ip);
    await audit("login.passkey_failed", { detail });
    return { error: t.loginFailed };
  };

  const challenge = await takePasskeyChallenge("login");
  if (!challenge) return { error: t.loginExpired };

  const passkey = await prisma.adminPasskey.findUnique({
    where: { id: String(response?.id ?? "") },
    include: { admin: true },
  });
  if (!passkey) return fail(m.admin.auditDetail.passkeyUnknown);

  let verification;
  try {
    verification = await verifyAuthenticationResponse({
      response,
      expectedChallenge: challenge.challenge,
      expectedOrigin: rp.origin,
      expectedRPID: rp.rpID,
      credential: {
        id: passkey.id,
        publicKey: new Uint8Array(passkey.publicKey),
        counter: passkey.counter,
        transports: decodeTransports(passkey.transports),
      },
      requireUserVerification: true,
    });
  } catch (error) {
    return fail(error instanceof Error ? error.message.slice(0, 200) : m.admin.auditDetail.passkeyError);
  }
  if (!verification.verified) return fail(m.admin.auditDetail.passkeyBadSignature);

  await prisma.adminPasskey.update({
    where: { id: passkey.id },
    data: {
      counter: verification.authenticationInfo.newCounter,
      backedUp: verification.authenticationInfo.credentialBackedUp,
      lastUsedAt: new Date(),
    },
  });

  const { admin } = passkey;
  const device = await readTrustedDevice(admin.username);
  await startAdminSession(admin);
  await rememberDevice(admin.username, device);
  await audit("login.success", {
    actor: admin.username,
    detail: format(m.admin.auditDetail.passkeyLogin, {
      device: device ? m.admin.auditDetail.trustedDevice : m.admin.auditDetail.newDevice,
      name: passkey.name,
    }),
    alert: !device,
  });
  redirect(safeAdminFrom(from));
}
