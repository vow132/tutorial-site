"use server";

import { randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/admin-auth";
import { audit } from "@/lib/audit";
import { parseDisplayName, readRole, ROLES, USERNAME_PATTERN, type Role } from "@/lib/roles";

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
  return typeof raw === "string" && raw in ROLES ? (raw as Role) : null;
}

export async function createUser(_prev: UserFormState, formData: FormData): Promise<UserFormState> {
  const admin = await requireAuth();
  const username = String(formData.get("username") ?? "").trim();
  if (!USERNAME_PATTERN.test(username)) return { error: "用户名要 3-32 位字母、数字、下划线或连字符" };
  const role = parseRole(formData.get("role"));
  if (!role) return { error: "请选择角色" };
  const displayName = parseDisplayName(formData.get("displayName"));
  if ("error" in displayName) return { error: displayName.error };
  if (await prisma.admin.findUnique({ where: { username }, select: { id: true } })) {
    return { error: `用户名 ${username} 已经有人用了` };
  }
  const password = randomPassword();
  await prisma.admin.create({
    data: { username, role, displayName: displayName.value, password: await bcrypt.hash(password, 12) },
  });
  await audit("user.create", { actor: admin.username, detail: `${username}（${ROLES[role].label}）` });
  revalidatePath("/admin/users");
  return { success: `已创建 ${username}（${ROLES[role].label}），把下面的初始密码交给本人，登录后请在「账号安全」里改掉。`, password };
}

export async function updateUser(_prev: UserFormState, formData: FormData): Promise<UserFormState> {
  const admin = await requireAuth();
  const id = Number(formData.get("id"));
  const target = id ? await prisma.admin.findUnique({ where: { id } }) : null;
  if (!target) return { error: "这个账号不存在或已被删除" };
  const role = parseRole(formData.get("role"));
  if (!role) return { error: "请选择角色" };
  const displayName = parseDisplayName(formData.get("displayName"));
  if ("error" in displayName) return { error: displayName.error };

  const current = readRole(target.role);
  if (role !== current) {
    if (target.id === admin.id) return { error: "不能修改自己的角色（防止把自己降级后没人能管理网站）" };
    if (current === "owner" && (await prisma.admin.count({ where: { role: "owner" } })) <= 1) {
      return { error: "至少要保留一个站长" };
    }
  }
  if (role === current && displayName.value === (target.displayName ?? null)) return { success: "没有变化" };

  await prisma.admin.update({ where: { id }, data: { role, displayName: displayName.value } });
  const changes = [
    role !== current ? `角色 ${ROLES[current].label} → ${ROLES[role].label}` : "",
    displayName.value !== (target.displayName ?? null) ? `署名「${displayName.value ?? "（不显示）"}」` : "",
  ].filter(Boolean);
  await audit("user.update", { actor: admin.username, detail: `${target.username}：${changes.join("，")}` });
  // 署名出现在文章页（ISR）
  if (displayName.value !== (target.displayName ?? null)) revalidatePath("/tutorials/[slug]", "page");
  revalidatePath("/admin/users");
  return { success: `已保存 ${target.username}` };
}

/** 帮别人重置：新的随机密码，同时关闭两步验证、删除恢复码和通行密钥、退出所有设备（和 npm run admin:reset 一样）。 */
export async function resetUserPassword(_prev: UserFormState, formData: FormData): Promise<UserFormState> {
  const admin = await requireAuth();
  const id = Number(formData.get("id"));
  const target = id ? await prisma.admin.findUnique({ where: { id }, select: { id: true, username: true } }) : null;
  if (!target) return { error: "这个账号不存在或已被删除" };
  if (target.id === admin.id) return { error: "自己的密码请在「账号安全」里修改" };
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
    success: `已重置 ${target.username}：两步验证和通行密钥已清除，所有设备已退出。把新密码交给本人：`,
    password,
  };
}

/** 删除账号：他写的教程转给执行删除的站长（文章不会丢，署名随之变成站长的）。 */
export async function deleteUser(_prev: UserFormState, formData: FormData): Promise<UserFormState> {
  const admin = await requireAuth();
  const id = Number(formData.get("id"));
  const target = id ? await prisma.admin.findUnique({ where: { id }, select: { id: true, username: true } }) : null;
  if (!target) return { error: "这个账号不存在或已被删除" };
  if (target.id === admin.id) return { error: "不能删除自己的账号" };
  const [moved] = await prisma.$transaction([
    prisma.tutorial.updateMany({ where: { authorId: id }, data: { authorId: admin.id } }),
    prisma.admin.delete({ where: { id } }),
  ]);
  await audit("user.delete", {
    actor: admin.username,
    detail: `${target.username}${moved.count ? `，${moved.count} 篇教程转给 ${admin.username}` : ""}`,
  });
  if (moved.count) revalidatePath("/tutorials/[slug]", "page");
  // 这一行随账号一起消失，结果显示在页面顶部
  redirect(`/admin/users?deleted=${encodeURIComponent(target.username)}&moved=${moved.count}`);
}
