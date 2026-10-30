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
import { readTotpSetup } from "@/lib/session";
import { verifyTotp } from "@/lib/totp";

export type CredentialsFormState = { error?: string; success?: string };

export async function updateAdminCredentials(
  _prev: CredentialsFormState,
  formData: FormData
): Promise<CredentialsFormState> {
  const { admin: current, sessionId } = await requireSession();
  const currentPassword = String(formData.get("currentPassword") ?? "");
  const username = String(formData.get("username") ?? "").trim();
  const newPassword = String(formData.get("newPassword") ?? "");
  const confirmPasswordValue = String(formData.get("confirmPassword") ?? "");

  const confirmError = await confirmCurrentPassword(current, currentPassword);
  if (confirmError) return { error: confirmError };
  if (!/^[A-Za-z0-9_-]{3,32}$/.test(username)) {
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
  _prev: CredentialsFormState,
  formData: FormData
): Promise<CredentialsFormState> {
  const { admin } = await requireSession();
  if (admin.totpSecret) return { error: "两步验证已经开启" };

  const confirmError = await confirmCurrentPassword(admin, String(formData.get("currentPassword") ?? ""));
  if (confirmError) return { error: confirmError };

  const secret = readTotpSetup(String(formData.get("setup") ?? ""), admin.id);
  if (!secret) return { error: "设置已过期，请刷新页面重新扫码" };
  const step = verifyTotp(secret, String(formData.get("code") ?? ""), null);
  if (step === null) return { error: "验证码不正确，请确认手机时间准确后重试" };

  await prisma.admin.update({
    where: { id: admin.id },
    data: { totpSecret: secret, totpLastStep: step },
  });
  await audit("totp.enable", { actor: admin.username });
  revalidatePath("/admin/account");
  return { success: "两步验证已开启，下次登录需要输入验证器中的 6 位数字" };
}

export async function disableTotp(
  _prev: CredentialsFormState,
  formData: FormData
): Promise<CredentialsFormState> {
  const { admin } = await requireSession();
  if (!admin.totpSecret) return { error: "两步验证未开启" };

  const confirmError = await confirmCurrentPassword(admin, String(formData.get("currentPassword") ?? ""));
  if (confirmError) return { error: confirmError };

  const step = verifyTotp(admin.totpSecret, String(formData.get("code") ?? ""), admin.totpLastStep);
  if (step === null) return { error: "验证码不正确或已被使用" };

  await prisma.admin.update({
    where: { id: admin.id },
    data: { totpSecret: null, totpLastStep: null },
  });
  await audit("totp.disable", { actor: admin.username });
  revalidatePath("/admin/account");
  return { success: "两步验证已关闭" };
}

export async function revokeOtherSessions() {
  const { admin, sessionId } = await requireSession();
  const { count } = await prisma.adminSession.deleteMany({
    where: { adminId: admin.id, NOT: { id: sessionId } },
  });
  await audit("session.revoke_others", { actor: admin.username, detail: `${count} 个会话` });
  revalidatePath("/admin/account");
}

export async function logoutEverywhere() {
  const { admin } = await requireSession();
  await prisma.adminSession.deleteMany({ where: { adminId: admin.id } });
  await endCurrentSession();
  await audit("session.revoke_all", { actor: admin.username });
  redirect("/admin/login");
}
