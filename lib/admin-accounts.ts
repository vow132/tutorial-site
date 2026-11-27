import type { Prisma, PrismaClient } from "@/generated/prisma/client";
import { readRole, type Role } from "@/lib/roles";

/*
 * 账号管理里会动到「站长」的两个写操作（lib/actions/users.ts 调用）。
 *
 * 规则：执行的人必须仍是站长，并且操作完至少还留一个站长。检查和写入放在同一个事务里：
 * @prisma/adapter-better-sqlite3 的事务带互斥锁、一个接一个执行，后执行的事务读到的是前一个提交后的状态。
 * 所以两个站长同时互相降级、或者同时互相删除时，只有先执行的那个成功，另一个发现自己已经不是站长而放弃，
 * 网站不会落到一个站长都没有。（多个进程连同一个库时，SQLite 会让后写的那个事务直接报错，同样不会两个都成功。）
 */

type Db = Pick<PrismaClient, "$transaction">;

async function isOwner(tx: Prisma.TransactionClient, id: number) {
  const row = await tx.admin.findUnique({ where: { id }, select: { role: true } });
  return !!row && readRole(row.role) === "owner";
}

/** 不能执行的原因（文字按后台语言：m.admin.users.errors） */
export type AccountProblem = "lostOwner" | "notFound" | "ownRole" | "lastOwner" | "deleteSelf";

/** 改别人的角色和署名。返回改之前的角色（写日志用）。 */
export async function changeAccount(
  db: Db,
  input: { actorId: number; targetId: number; role: Role; displayName: string | null },
): Promise<{ error: AccountProblem } | { previousRole: Role }> {
  return db.$transaction(async (tx) => {
    if (!(await isOwner(tx, input.actorId))) return { error: "lostOwner" as const };
    const target = await tx.admin.findUnique({ where: { id: input.targetId }, select: { role: true } });
    if (!target) return { error: "notFound" as const };
    const previousRole = readRole(target.role);
    if (previousRole !== input.role && input.targetId === input.actorId) {
      return { error: "ownRole" as const };
    }
    if (previousRole === "owner" && input.role !== "owner" && (await tx.admin.count({ where: { role: "owner" } })) <= 1) {
      return { error: "lastOwner" as const };
    }
    await tx.admin.update({ where: { id: input.targetId }, data: { role: input.role, displayName: input.displayName } });
    return { previousRole };
  });
}

/** 删除别人的账号：他的教程转给执行删除的站长（会话、通行密钥、恢复码随账号级联删除）。返回转走的教程数。 */
export async function removeAccount(
  db: Db,
  input: { actorId: number; targetId: number },
): Promise<{ error: AccountProblem } | { moved: number }> {
  if (input.targetId === input.actorId) return { error: "deleteSelf" };
  return db.$transaction(async (tx) => {
    if (!(await isOwner(tx, input.actorId))) return { error: "lostOwner" as const };
    const moved = await tx.tutorial.updateMany({ where: { authorId: input.targetId }, data: { authorId: input.actorId } });
    const deleted = await tx.admin.deleteMany({ where: { id: input.targetId } });
    if (!deleted.count) return { error: "notFound" as const };
    return { moved: moved.count };
  });
}
