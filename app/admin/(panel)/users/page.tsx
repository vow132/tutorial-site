import type { Metadata } from "next";
import { requireAdminPage } from "@/lib/admin-auth";
import { prisma } from "@/lib/prisma";
import { ROLE_ORDER, ROLES, readRole } from "@/lib/roles";
import { CreateUserForm, UserRow } from "./user-forms";

export const metadata: Metadata = { title: "账号管理" };
export const dynamic = "force-dynamic";

const dateFormat = new Intl.DateTimeFormat("zh-CN", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Shanghai" });

/** 账号管理：多人一起写教程时给每个人开账号、分配角色（只有站长能进，requireAdminPage 默认只允许站长）。 */
export default async function AdminUsersPage({ searchParams }: { searchParams: Promise<{ deleted?: string; moved?: string }> }) {
  const admin = await requireAdminPage();
  const { deleted, moved } = await searchParams;
  const users = await prisma.admin.findMany({
    orderBy: { id: "asc" },
    select: {
      id: true,
      username: true,
      displayName: true,
      role: true,
      totpSecret: true,
      _count: { select: { tutorials: true } },
      sessions: { orderBy: { createdAt: "desc" }, take: 1, select: { createdAt: true } },
    },
  });

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-ink">账号管理</h1>
        <p className="mt-1 text-sm text-ink-3">多人一起写教程时，给每个人单独开账号；每个人用自己的密码和两步验证登录，安全日志里能看到谁做了什么。</p>
      </div>

      {deleted && (
        <p role="status" className="rounded-2xl bg-emerald-500/10 px-4 py-3 text-sm text-emerald-700 dark:text-emerald-300">
          已删除 {deleted}
          {Number(moved) > 0 && `，${Number(moved)} 篇教程转到了你名下`}
        </p>
      )}

      <section className="rounded-3xl border border-line bg-surface p-6">
        <h2 className="text-base font-bold text-ink">角色说明</h2>
        <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-3">
          {ROLE_ORDER.map((role) => (
            <div key={role} className="rounded-2xl bg-paper/60 p-3">
              <dt className="font-semibold text-ink">{ROLES[role].label}</dt>
              <dd className="mt-1 text-xs text-ink-3">{ROLES[role].description}</dd>
            </div>
          ))}
        </dl>
        <p className="mt-3 text-xs text-ink-3">文章页显示作者的「署名」；不填署名就不显示，登录用户名不会出现在前台。</p>
      </section>

      <section className="rounded-3xl border border-line bg-surface p-6">
        <h2 className="text-base font-bold text-ink">新建账号</h2>
        <p className="mb-4 mt-1 text-xs text-ink-3">密码由系统随机生成，只显示一次，请转交本人，让他登录后在「账号安全」里改掉。</p>
        <CreateUserForm />
      </section>

      <section className="rounded-3xl border border-line bg-surface p-6">
        <h2 className="text-base font-bold text-ink">全部账号（{users.length}）</h2>
        <ul className="mt-4 space-y-3">
          {users.map((user) => (
            <UserRow
              key={user.id}
              user={{
                id: user.id,
                username: user.username,
                displayName: user.displayName,
                role: readRole(user.role),
                twoFactor: Boolean(user.totpSecret),
                tutorials: user._count.tutorials,
                lastLogin: user.sessions[0] ? dateFormat.format(user.sessions[0].createdAt) : null,
                self: user.id === admin.id,
              }}
            />
          ))}
        </ul>
      </section>
    </div>
  );
}
