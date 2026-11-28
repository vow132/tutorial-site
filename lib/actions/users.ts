"use server";

import { randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { changeAccount, removeAccount } from "@/lib/admin-accounts";
import { requireAuth } from "@/lib/admin-auth";
import { audit } from "@/lib/audit";
import { isRole, parseDisplayName, readRole, USERNAME_PATTERN, type Role } from "@/lib/roles";
import { getAdminI18n } from "@/lib/i18n/server";

/**
 * 账号管理（只有站长能用：requireAuth() 不传权限即只允许站长）。
 * 新账号和重置后的密码都由服务器随机生成，只在这一次响应里显示，由站长转交本人，本人登录后在「账号安全」里改掉。
 */
export type UserFormState = { error?: string; success?: string; password?: string };

function randomPassword() {
  // 18 字节 → 24 个字符的 base64url，满足密码策略（长度、字符种类）
  return randomBytes(18).toString("base64url");
}

function parseRole(raw: FormDataEntryValue | null): Role | null {
  return isRole(raw) ? raw : null;
}

export async function createUser(_prev: UserFormState, formData: FormData): Promise<UserFormState> {
  const admin = await requireAuth();
  const { m, f } = await getAdminI18n();
  const t = m.admin.users;
  const username = String(formData.get("username") ?? "").trim();
  if (!USERNAME_PATTERN.test(username)) return { error: t.badUsername };
  const role = parseRole(formData.get("role"));
  if (!role) return { error: t.chooseRole };
  const displayName = parseDisplayName(formData.get("displayName"), m.admin.validation);
  if ("error" in displayName) return { error: displayName.error };
  if (await prisma.admin.findUnique({ where: { username }, select: { id: true } })) {
    return { error: f(t.usernameTaken, { name: username }) };
  }
  const password = randomPassword();
  await prisma.admin.create({
    data: { username, role, displayName: displayName.value, password: await bcrypt.hash(password, 12) },
  });
  await audit("user.create", { actor: admin.username, detail: f(m.admin.authorOption, { name: username, role: m.admin.roles[role].label }) });
  revalidatePath("/admin/users");
  return { success: f(t.created, { name: username, role: m.admin.roles[role].label }), password };
}

export async function updateUser(_prev: UserFormState, formData: FormData): Promise<UserFormState> {
  const admin = await requireAuth();
  const { m, f } = await getAdminI18n();
  const t = m.admin.users;
  const id = Number(formData.get("id"));
  const target = id ? await prisma.admin.findUnique({ where: { id } }) : null;
  if (!target) return { error: t.errors.notFound };
  const role = parseRole(formData.get("role"));
  if (!role) return { error: t.chooseRole };
  const displayName = parseDisplayName(formData.get("displayName"), m.admin.validation);
  if ("error" in displayName) return { error: displayName.error };
  if (role === readRole(target.role) && displayName.value === (target.displayName ?? null)) return { success: t.unchanged };

  // 「不能改自己的角色、至少留一个站长」在事务里检查（lib/admin-accounts.ts）
  const result = await changeAccount(prisma, { actorId: admin.id, targetId: id, role, displayName: displayName.value });
  if ("error" in result) return { error: t.errors[result.error] };
  const roleChanged = role !== result.previousRole;
  const changes = [
    roleChanged ? f(t.auditRole, { from: m.admin.roles[result.previousRole].label, to: m.admin.roles[role].label }) : "",
    displayName.value !== (target.displayName ?? null) ? f(t.auditByline, { name: displayName.value ?? t.auditNoByline }) : "",
  ].filter(Boolean);
  // 改了角色要推送告警（lib/alerts.ts），只改署名不推送
  await audit("user.update", { actor: admin.username, detail: `${target.username}: ${changes.join("; ")}`, alert: roleChanged });
  // 署名出现在文章页（ISR）
  if (displayName.value !== (target.displayName ?? null)) revalidatePath("/tutorials/[slug]", "page");
  revalidatePath("/admin/users");
  return { success: f(t.saved, { name: target.username }) };
}

/** 帮别人重置：新的随机密码，同时关闭两步验证、删除恢复码和通行密钥、退出所有设备（和 npm run admin:reset 一样）。 */
export async function resetUserPassword(_prev: UserFormState, formData: FormData): Promise<UserFormState> {
  const admin = await requireAuth();
  const { m, f } = await getAdminI18n();
  const t = m.admin.users;
  const id = Number(formData.get("id"));
  const target = id ? await prisma.admin.findUnique({ where: { id }, select: { id: true, username: true } }) : null;
  if (!target) return { error: t.errors.notFound };
  if (target.id === admin.id) return { error: t.selfReset };
  const password = randomPassword();
  await prisma.$transaction([
    prisma.admin.update({
      where: { id },
      data: { password: await bcrypt.hash(password, 12), totpSecret: null, totpLastStep: null },
    }),
    prisma.adminRecoveryCode.deleteMany({ where: { adminId: id } }),
    prisma.adminPasskey.deleteMany({ where: { adminId: id } }),
    prisma.adminSession.deleteMany({ where: { adminId: id } }),
  ]);
  await audit("user.reset", { actor: admin.username, detail: target.username });
  revalidatePath("/admin/users");
  return {
    success: f(t.resetDone, { name: target.username }),
    password,
  };
}

/** 删除账号：他写的教程转给执行删除的站长（文章不会丢，署名随之变成站长的）。 */
export async function deleteUser(_prev: UserFormState, formData: FormData): Promise<UserFormState> {
  const admin = await requireAuth();
  const { m, plural } = await getAdminI18n();
  const t = m.admin.users;
  const id = Number(formData.get("id"));
  const target = id ? await prisma.admin.findUnique({ where: { id }, select: { id: true, username: true } }) : null;
  if (!target) return { error: t.errors.notFound };
  const result = await removeAccount(prisma, { actorId: admin.id, targetId: id });
  if ("error" in result) return { error: t.errors[result.error] };
  await audit("user.delete", {
    actor: admin.username,
    detail: `${target.username}${result.moved ? plural(result.moved, t.auditMoved, { to: admin.username }) : ""}`,
  });
  if (result.moved) revalidatePath("/tutorials/[slug]", "page");
  // 这一行随账号一起消失，结果显示在页面顶部
  redirect(`/admin/users?deleted=${encodeURIComponent(target.username)}&moved=${result.moved}`);
}
