import type { Metadata } from "next";
import { requireAdminPage } from "@/lib/admin-auth";
import { isSchedulerActor } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { displayIp, isDemoMode } from "@/lib/demo";
import { getAdminI18n } from "@/lib/i18n/server";
import { rich } from "@/lib/i18n/rich";

export async function generateMetadata(): Promise<Metadata> {
  const { m } = await getAdminI18n();
  return { title: m.admin.auditLog.metaTitle };
}
export const dynamic = "force-dynamic";

const WARNING = new Set([
  "login.failed",
  "login.totp_failed",
  "login.locked",
  "login.passkey_failed",
  "site-update.denied",
  "account.reset_cli",
  "totp.disable",
  "login.recovery_code",
  "user.reset",
  "user.delete",
  "setup.failed",
]);

const DATE_TIME: Intl.DateTimeFormatOptions = { dateStyle: "short", timeStyle: "medium" };

function countRecentFailedLogins() {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
  return prisma.auditLog.count({
    where: { action: { in: ["login.failed", "login.totp_failed"] }, createdAt: { gte: since } },
  });
}

export default async function AuditLogPage() {
  await requireAdminPage();
  const { m, plural, date } = await getAdminI18n();
  const t = m.admin.auditLog;
  const [entries, failedLogins, admins] = await Promise.all([
    prisma.auditLog.findMany({ orderBy: { id: "desc" }, take: 200 }),
    countRecentFailedLogins(),
    prisma.admin.findMany({ select: { username: true } }),
  ]);
  // 演示站：登录失败时访客随手填的用户名不显示（只显示真实存在的管理员名），IP 打码
  const demo = isDemoMode();
  const adminNames = new Set(admins.map((admin) => admin.username));
  const actorOf = (actor: string | null) => {
    if (isSchedulerActor(actor)) return t.schedulerActor;
    return actor && demo && !adminNames.has(actor) ? t.hiddenActor : actor;
  };

  return (
    <div>
      <h1 className="text-2xl font-bold text-ink">{t.heading}</h1>
      <p className="mt-1 text-sm text-ink-3">
        {t.intro} {plural(failedLogins, failedLogins >= 20 ? t.failedHigh : t.failed)}
      </p>

      <div className="mt-6 overflow-x-auto rounded-3xl border border-line bg-surface">
        <table className="w-full min-w-[640px] text-left text-sm">
          <thead className="border-b border-line text-xs text-ink-3">
            <tr>
              <th className="px-5 py-3 font-medium">{t.colTime}</th>
              <th className="px-5 py-3 font-medium">{t.colAction}</th>
              <th className="px-5 py-3 font-medium">{t.colActor}</th>
              <th className="px-5 py-3 font-medium">{t.colIp}</th>
              <th className="px-5 py-3 font-medium">{t.colDetail}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {entries.map((entry) => (
              <tr key={entry.id}>
                <td className="whitespace-nowrap px-5 py-3 text-ink-3">
                  {date(entry.createdAt, DATE_TIME)}
                </td>
                <td
                  className={`whitespace-nowrap px-5 py-3 font-medium ${
                    WARNING.has(entry.action) ? "text-red-500" : "text-ink"
                  }`}
                >
                  {t.actions[entry.action] ?? entry.action}
                </td>
                <td className="px-5 py-3 text-ink-2">{actorOf(entry.actor) ?? "—"}</td>
                <td className="whitespace-nowrap px-5 py-3 text-ink-3">{displayIp(entry.ip) ?? "—"}</td>
                <td className="px-5 py-3 text-ink-2">{entry.detail ?? ""}</td>
              </tr>
            ))}
            {entries.length === 0 && (
              <tr>
                <td colSpan={5} className="px-5 py-10 text-center text-ink-3">
                  {t.empty}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <p className="mt-3 text-xs text-ink-3">
        {rich(t.ipNote, { env: <code>TRUST_PROXY=true</code> })}
      </p>
    </div>
  );
}
