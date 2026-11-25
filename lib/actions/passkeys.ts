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
import { DEMO_READ_ONLY_MESSAGE, isDemoMode } from "@/lib/demo";

type Result = { error?: string; success?: string };

/** 登记新通行密钥第一步：确认当前密码（防止被盗会话偷偷加一把“后门钥匙”），返回浏览器要用的参数。 */
export async function beginPasskeyRegistration(
  rawName: string,
  currentPassword: string,
): Promise<Result & { options?: PublicKeyCredentialCreationOptionsJSON }> {
  if (isDemoMode()) return { error: DEMO_READ_ONLY_MESSAGE };
  const { admin } = await requireSession("account");
  const rp = relyingParty();
  if ("error" in rp) return { error: rp.error };

  const name = String(rawName ?? "").trim().slice(0, 40);
  if (!name) return { error: "请给这个通行密钥起个名字，如「MacBook 指纹」「iPhone」" };
  const passwordError = await confirmCurrentPassword(admin, String(currentPassword ?? ""));
  if (passwordError) return { error: passwordError };

  const existing = await prisma.adminPasskey.findMany({
    where: { adminId: admin.id },
    select: { id: true, transports: true },
  });
  if (existing.length >= MAX_PASSKEYS) return { error: `最多登记 ${MAX_PASSKEYS} 个通行密钥，请先删除不用的` };

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
  const rp = relyingParty();
  if ("error" in rp) return { error: rp.error };
  const challenge = await takePasskeyChallenge("register");
  if (!challenge || challenge.adminId !== admin.id) return { error: "操作已过期，请重新添加" };

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
    return { error: `通行密钥校验失败：${error instanceof Error ? error.message : "未知错误"}` };
  }
  if (!verification.verified) return { error: "通行密钥校验失败，请重试" };

  const { credential, credentialBackedUp } = verification.registrationInfo;
  const name = challenge.name ?? "通行密钥";
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
  return { success: `已添加「${name}」，下次可直接用它登录` };
}

export async function removePasskey(id: string): Promise<Result> {
  if (isDemoMode()) return { error: DEMO_READ_ONLY_MESSAGE };
  const { admin } = await requireSession("account");
  const passkey = await prisma.adminPasskey.findFirst({ where: { id: String(id), adminId: admin.id } });
  if (!passkey) return { error: "通行密钥不存在" };
  await prisma.adminPasskey.delete({ where: { id: passkey.id } });
  await audit("passkey.remove", { actor: admin.username, detail: passkey.name });
  revalidatePath("/admin/account");
  revalidatePath("/admin/login");
  return { success: `已删除「${passkey.name}」` };
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
  const rp = relyingParty();
  if ("error" in rp) return { error: rp.error };
  const wait = await passkeyLoginWait(await getClientIp());
  if (wait > 0) return { error: `尝试次数过多，请约 ${Math.ceil(wait / 60)} 分钟后再试` };
  const options = await generateAuthenticationOptions({ rpID: rp.rpID, userVerification: "required" });
  await storePasskeyChallenge("login", options.challenge);
  return { options };
}

/** 通行密钥登录第二步：验证签名后建立会话。通行密钥已含设备持有 + 生物识别/PIN，不再要求两步验证码。 */
export async function finishPasskeyLogin(response: AuthenticationResponseJSON, from?: string): Promise<Result> {
  const rp = relyingParty();
  if ("error" in rp) return { error: rp.error };
  const ip = await getClientIp();
  const wait = await passkeyLoginWait(ip);
  if (wait > 0) return { error: `尝试次数过多，请约 ${Math.ceil(wait / 60)} 分钟后再试` };

  const fail = async (detail: string) => {
    loginLimiters.global.hit("all");
    if (ip) loginLimiters.ip.hit(ip);
    await audit("login.passkey_failed", { detail });
    return { error: "通行密钥验证失败，请重试或改用密码登录" };
  };

  const challenge = await takePasskeyChallenge("login");
  if (!challenge) return { error: "操作已过期，请重新点击「使用通行密钥登录」" };

  const passkey = await prisma.adminPasskey.findUnique({
    where: { id: String(response?.id ?? "") },
    include: { admin: true },
  });
  if (!passkey) return fail("未登记的通行密钥");

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
    return fail(error instanceof Error ? error.message.slice(0, 200) : "校验异常");
  }
  if (!verification.verified) return fail("签名无效");

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
    detail: `${device ? "受信任设备" : "新设备"}（通行密钥：${passkey.name}）`,
  });
  redirect(safeAdminFrom(from));
}
