"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/admin-auth";
import {
  SESSION_COOKIE,
  SESSION_MAX_AGE_SECONDS,
  signSession,
} from "@/lib/session";

export type CredentialsFormState = { error?: string; success?: string };

export async function updateAdminCredentials(
  _prev: CredentialsFormState,
  formData: FormData
): Promise<CredentialsFormState> {
  const current = await requireAuth();
  const currentPassword = String(formData.get("currentPassword") ?? "");
  const username = String(formData.get("username") ?? "").trim();
  const newPassword = String(formData.get("newPassword") ?? "");
  const confirmPassword = String(formData.get("confirmPassword") ?? "");

  if (!currentPassword || !(await bcrypt.compare(currentPassword, current.password))) {
    return { error: "当前密码不正确" };
  }
  if (!/^[A-Za-z0-9_-]{3,32}$/.test(username)) {
    return { error: "用户名需为 3-32 位字母、数字、下划线或连字符" };
  }
  if (newPassword && newPassword.length < 8) {
    return { error: "新密码至少需要 8 位" };
  }
  if (newPassword !== confirmPassword) {
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
    const updated = await prisma.admin.update({
      where: { id: current.id },
      data: { username, password },
    });

    // Rotate the cookie immediately so the current browser remains logged in,
    // while all sessions carrying the old credential fingerprint expire.
    const store = await cookies();
    store.set(SESSION_COOKIE, signSession(updated.username, updated.password), {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.SESSION_COOKIE_SECURE === "true",
      path: "/",
      maxAge: SESSION_MAX_AGE_SECONDS,
    });
    revalidatePath("/admin/account");
    return { success: "管理员账号已更新" };
  } catch {
    return { error: "保存失败，请稍后重试" };
  }
}