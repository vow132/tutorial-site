import type { Metadata } from "next";
import { requireAdminPage } from "@/lib/admin-auth";
import { prisma } from "@/lib/prisma";
import { ROLE_ORDER, readRole } from "@/lib/roles";
import { CreateUserForm, UserRow } from "./user-forms";
import { getAdminI18n } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const { m } = await getAdminI18n();
  return { title: m.admin.users.metaTitle };
}
export const dynamic = "force-dynamic";

/** 账号管理：多人一起写教程时给每个人开账号、分配角色（只有站长能进，requireAdminPage 默认只允许站长）。 */
export default async function AdminUsersPage({ searchParams }: { searchParams: Promise<{ deleted?: string; moved?: string }> }) {
  const admin = await requireAdminPage();
  const { m, f, plural, date } = await getAdminI18n();
  const t = m.admin.users;
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
        <h1 className="text-2xl font-bold text-ink">{t.heading}</h1>
        <p className="mt-1 text-sm text-ink-3">{t.intro}</p>
      </div>

      {deleted && (
        <p role="status" className="rounded-2xl bg-emerald-500/10 px-4 py-3 text-sm text-emerald-700 dark:text-emerald-300">
          {f(t.deleted, { name: deleted })}
          {Number(moved) > 0 && plural(Number(moved), t.moved)}
        </p>
      )}

      <section className="rounded-3xl border border-line bg-surface p-6">
        <h2 className="text-base font-bold text-ink">{t.rolesHeading}</h2>
        <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-3">
          {ROLE_ORDER.map((role) => (
            <div key={role} className="rounded-2xl bg-paper/60 p-3">
              <dt className="font-semibold text-ink">{m.admin.roles[role].label}</dt>
              <dd className="mt-1 text-xs text-ink-3">{m.admin.roles[role].description}</dd>
            </div>
          ))}
        </dl>
        <p className="mt-3 text-xs text-ink-3">{t.bylineNote}</p>
      </section>

      <section className="rounded-3xl border border-line bg-surface p-6">
        <h2 className="text-base font-bold text-ink">{t.newHeading}</h2>
        <p className="mb-4 mt-1 text-xs text-ink-3">{t.newHint}</p>
        <CreateUserForm />
      </section>

      <section className="rounded-3xl border border-line bg-surface p-6">
        <h2 className="text-base font-bold text-ink">{f(t.allHeading, { n: users.length })}</h2>
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
                lastLogin: user.sessions[0] ? date(user.sessions[0].createdAt, { dateStyle: "medium", timeStyle: "short" }) : null,
                self: user.id === admin.id,
              }}
            />
          ))}
        </ul>
      </section>
    </div>
  );
}
