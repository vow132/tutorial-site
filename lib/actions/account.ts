"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import {
  confirmCurrentPassword,
  endCurrentSession,
  readTrustedDevice,
  refreshSessionCookie,
  rememberDevice,
  requireSession,
} from "@/lib/admin-auth";
import { audit } from "@/lib/audit";
import { passwordProblem } from "@/lib/password-policy";
import { parseDisplayName, USERNAME_PATTERN } from "@/lib/roles";
import { generateRecoveryCodes } from "@/lib/recovery-codes";
import { sealTotpSecret, verifySecondFactor } from "@/lib/second-factor";
import { getAdminI18n } from "@/lib/i18n/server";
import { readTotpSetup } from "@/lib/session";
import { verifyTotp } from "@/lib/totp";
import { revalidateSiteRoute } from "@/lib/revalidate-public";

export type CredentialsFormState = { error?: string; success?: string };
/** 新生成的恢复码只在这一次响应里出现，页面展示后不再能看到。 */
export type TwoFactorFormState = CredentialsFormState & { recoveryCodes?: string[] };

/** 换一整套恢复码：旧的全部作废。 */
async function replaceRecoveryCodes(adminId: number) {
  const { codes, hashes } = generateRecoveryCodes();
  await prisma.$transaction([
    prisma.adminRecoveryCode.deleteMany({ where: { adminId } }),
    prisma.adminRecoveryCode.createMany({ data: hashes.map((codeHash) => ({ adminId, codeHash })) }),
  ]);
  return codes;
}

export async function updateAdminCredentials(
  _prev: CredentialsFormState,
  formData: FormData
): Promise<CredentialsFormState> {
  const { admin: current, sessionId } = await requireSession("account");
  const currentPassword = String(formData.get("currentPassword") ?? "");
  const username = String(formData.get("username") ?? "").trim();
  const newPassword = String(formData.get("newPassword") ?? "");
  const confirmPasswordValue = String(formData.get("confirmPassword") ?? "");
  const { m, f } = await getAdminI18n();
  const t = m.admin.account;

  const confirmError = await confirmCurrentPassword(current, currentPassword);
  if (confirmError) return { error: confirmError };
  if (!USERNAME_PATTERN.test(username)) {
    return { error: t.badUsername };
  }
  if (newPassword) {
    const problem = passwordProblem(newPassword, username, m.admin.password);
    if (problem) return { error: problem };
  }
  if (newPassword !== confirmPasswordValue) {
    return { error: t.passwordMismatch };
  }

  if (username !== current.username) {
    const exists = await prisma.admin.findUnique({ where: { username } });
    if (exists && exists.id !== current.id) {
      return { error: t.usernameTaken };
    }
  }

  const password = newPassword
    ? await bcrypt.hash(newPassword, 12)
    : current.password;

  try {
    const device = await readTrustedDevice(current.username);
    const updated = await prisma.admin.update({
      where: { id: current.id },
      data: { username, password },
    });
    // Every other device must sign in again with the new credentials.
    await prisma.adminSession.deleteMany({
      where: { adminId: current.id, NOT: { id: sessionId } },
    });
    await refreshSessionCookie(updated, sessionId);
    await rememberDevice(updated.username, device);
    await audit("account.update", {
      actor: updated.username,
      detail: [
        username !== current.username ? f(t.auditRenamed, { from: current.username, to: username }) : "",
        newPassword ? t.auditPassword : "",
      ].filter(Boolean).join("; ") || t.auditUnchanged,
    });
    revalidatePath("/admin/account");
    return { success: t.updated };
  } catch {
    return { error: t.saveFailed };
  }
}

export async function enableTotp(
  _prev: TwoFactorFormState,
  formData: FormData
): Promise<TwoFactorFormState> {
  const { admin } = await requireSession("account");
  const t = (await getAdminI18n()).m.admin.account;
  if (admin.totpSecret) return { error: t.totpAlready };

  const confirmError = await confirmCurrentPassword(admin, String(formData.get("currentPassword") ?? ""));
  if (confirmError) return { error: confirmError };

  const secret = readTotpSetup(String(formData.get("setup") ?? ""), admin.id);
  if (!secret) return { error: t.totpSetupExpired };
  const step = verifyTotp(secret, String(formData.get("code") ?? ""), null);
  if (step === null) return { error: t.totpWrong };

  await prisma.admin.update({
    where: { id: admin.id },
    data: { totpSecret: sealTotpSecret(secret), totpLastStep: step },
  });
  const recoveryCodes = await replaceRecoveryCodes(admin.id);
  await audit("totp.enable", { actor: admin.username });
  return {
    success: t.totpEnabled,
    recoveryCodes,
  };
}

export async function disableTotp(
  _prev: CredentialsFormState,
  formData: FormData
): Promise<CredentialsFormState> {
  const { admin } = await requireSession("account");
  const { m } = await getAdminI18n();
  const t = m.admin.account;
  if (!admin.totpSecret) return { error: t.totpNotEnabled };

  const confirmError = await confirmCurrentPassword(admin, String(formData.get("currentPassword") ?? ""));
  if (confirmError) return { error: confirmError };

  const factor = await verifySecondFactor(admin, String(formData.get("code") ?? ""));
  if (!factor.ok) {
    return { error: factor.reason === "locked" ? m.admin.login.totpLocked : t.secondFactorWrong };
  }

  await prisma.$transaction([
    prisma.admin.update({
      where: { id: admin.id },
      data: { totpSecret: null, totpLastStep: null },
    }),
    prisma.adminRecoveryCode.deleteMany({ where: { adminId: admin.id } }),
  ]);
  await audit("totp.disable", { actor: admin.username });
  revalidatePath("/admin/account");
  return { success: t.totpDisabled };
}

/** 重新生成恢复码（旧码全部作废）。需要当前密码 + 验证码或一个恢复码。 */
export async function regenerateRecoveryCodes(
  _prev: TwoFactorFormState,
  formData: FormData
): Promise<TwoFactorFormState> {
  const { admin } = await requireSession("account");
  const { m } = await getAdminI18n();
  const t = m.admin.account;
  if (!admin.totpSecret) return { error: t.totpRequired };

  const confirmError = await confirmCurrentPassword(admin, String(formData.get("currentPassword") ?? ""));
  if (confirmError) return { error: confirmError };
  const factor = await verifySecondFactor(admin, String(formData.get("code") ?? ""));
  if (!factor.ok) {
    return { error: factor.reason === "locked" ? m.admin.login.totpLocked : t.secondFactorWrong };
  }

  const recoveryCodes = await replaceRecoveryCodes(admin.id);
  await audit("recovery_codes.regenerate", { actor: admin.username });
  return { success: t.recoveryRegenerated, recoveryCodes };
}

export async function revokeOtherSessions() {
  const { admin, sessionId } = await requireSession("account");
  const { count } = await prisma.adminSession.deleteMany({
    where: { adminId: admin.id, NOT: { id: sessionId } },
  });
  const { m, plural } = await getAdminI18n();
  await audit("session.revoke_others", { actor: admin.username, detail: plural(count, m.admin.account.auditSessions) });
  revalidatePath("/admin/account");
}

export async function logoutEverywhere() {
  const { admin } = await requireSession("account");
  await prisma.adminSession.deleteMany({ where: { adminId: admin.id } });
  await endCurrentSession();
  await audit("session.revoke_all", { actor: admin.username });
  redirect("/admin/login");
}

/** 改自己的署名（文章页显示的作者名）：所有角色都能改，写了署名的教程页随之刷新。 */
export async function updateDisplayName(_prev: CredentialsFormState, formData: FormData): Promise<CredentialsFormState> {
  const { admin } = await requireSession("account");
  const { m, f } = await getAdminI18n();
  const t = m.admin.account;
  const parsed = parseDisplayName(formData.get("displayName"), m.admin.validation);
  if ("error" in parsed) return { error: parsed.error };
  if (parsed.value === (admin.displayName ?? null)) return { success: t.bylineUnchanged };
  await prisma.admin.update({ where: { id: admin.id }, data: { displayName: parsed.value } });
  await audit("account.display_name", { actor: admin.username, detail: parsed.value ?? t.auditNoByline });
  // 署名出现在文章页（ISR）：作者的教程页全部失效
  revalidateSiteRoute("/tutorials/[slug]");
  revalidatePath("/admin/account");
  return { success: parsed.value ? f(t.bylineSaved, { name: parsed.value }) : t.bylineCleared };
}
