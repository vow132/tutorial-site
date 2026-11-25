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
import { LOCKED_TOTP_MESSAGE, sealTotpSecret, verifySecondFactor } from "@/lib/second-factor";
import { readTotpSetup } from "@/lib/session";
import { verifyTotp } from "@/lib/totp";

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

  const confirmError = await confirmCurrentPassword(current, currentPassword);
  if (confirmError) return { error: confirmError };
  if (!USERNAME_PATTERN.test(username)) {
    return { error: "用户名需为 3-32 位字母、数字、下划线或连字符" };
  }
  if (newPassword) {
    const problem = passwordProblem(newPassword, username);
    if (problem) return { error: problem };
  }
  if (newPassword !== confirmPasswordValue) {
    return { error: "两次输入的新密码不一致" };
  }

  if (username !== current.username) {
    const exists = await prisma.admin.findUnique({ where: { username } });
    if (exists && exists.id !== current.id) {
      return { error: "该用户名已被占用" };
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
        username !== current.username ? `用户名 ${current.username} → ${username}` : "",
        newPassword ? "已修改密码" : "",
      ].filter(Boolean).join("；") || "无变化",
    });
    revalidatePath("/admin/account");
    return { success: "管理员账号已更新，其他设备上的登录已失效" };
  } catch {
    return { error: "保存失败，请稍后重试" };
  }
}

export async function enableTotp(
  _prev: TwoFactorFormState,
  formData: FormData
): Promise<TwoFactorFormState> {
  const { admin } = await requireSession("account");
  if (admin.totpSecret) return { error: "两步验证已经开启" };

  const confirmError = await confirmCurrentPassword(admin, String(formData.get("currentPassword") ?? ""));
  if (confirmError) return { error: confirmError };

  const secret = readTotpSetup(String(formData.get("setup") ?? ""), admin.id);
  if (!secret) return { error: "设置已过期，请刷新页面重新扫码" };
  const step = verifyTotp(secret, String(formData.get("code") ?? ""), null);
  if (step === null) return { error: "验证码不正确，请确认手机时间准确后重试" };

  await prisma.admin.update({
    where: { id: admin.id },
    data: { totpSecret: sealTotpSecret(secret), totpLastStep: step },
  });
  const recoveryCodes = await replaceRecoveryCodes(admin.id);
  await audit("totp.enable", { actor: admin.username });
  return {
    success: "两步验证已开启，下次登录需要输入验证器中的 6 位数字",
    recoveryCodes,
  };
}

export async function disableTotp(
  _prev: CredentialsFormState,
  formData: FormData
): Promise<CredentialsFormState> {
  const { admin } = await requireSession("account");
  if (!admin.totpSecret) return { error: "两步验证未开启" };

  const confirmError = await confirmCurrentPassword(admin, String(formData.get("currentPassword") ?? ""));
  if (confirmError) return { error: confirmError };

  const factor = await verifySecondFactor(admin, String(formData.get("code") ?? ""));
  if (!factor.ok) {
    return { error: factor.reason === "locked" ? LOCKED_TOTP_MESSAGE : "验证码或恢复码不正确，或已被使用" };
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
  return { success: "两步验证已关闭" };
}

/** 重新生成恢复码（旧码全部作废）。需要当前密码 + 验证码或一个恢复码。 */
export async function regenerateRecoveryCodes(
  _prev: TwoFactorFormState,
  formData: FormData
): Promise<TwoFactorFormState> {
  const { admin } = await requireSession("account");
  if (!admin.totpSecret) return { error: "请先开启两步验证" };

  const confirmError = await confirmCurrentPassword(admin, String(formData.get("currentPassword") ?? ""));
  if (confirmError) return { error: confirmError };
  const factor = await verifySecondFactor(admin, String(formData.get("code") ?? ""));
  if (!factor.ok) {
    return { error: factor.reason === "locked" ? LOCKED_TOTP_MESSAGE : "验证码或恢复码不正确，或已被使用" };
  }

  const recoveryCodes = await replaceRecoveryCodes(admin.id);
  await audit("recovery_codes.regenerate", { actor: admin.username });
  return { success: "已生成新的恢复码，旧的恢复码全部作废", recoveryCodes };
}

export async function revokeOtherSessions() {
  const { admin, sessionId } = await requireSession("account");
  const { count } = await prisma.adminSession.deleteMany({
    where: { adminId: admin.id, NOT: { id: sessionId } },
  });
  await audit("session.revoke_others", { actor: admin.username, detail: `${count} 个会话` });
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
  const parsed = parseDisplayName(formData.get("displayName"));
  if ("error" in parsed) return { error: parsed.error };
  if (parsed.value === (admin.displayName ?? null)) return { success: "署名没有变化" };
  await prisma.admin.update({ where: { id: admin.id }, data: { displayName: parsed.value } });
  await audit("account.display_name", { actor: admin.username, detail: parsed.value ?? "（不显示署名）" });
  // 署名出现在文章页（ISR）：作者的教程页全部失效
  revalidatePath("/tutorials/[slug]", "page");
  revalidatePath("/admin/account");
  return { success: parsed.value ? `已保存，文章页会显示「${parsed.value}」` : "已清空，文章页不再显示署名" };
}
