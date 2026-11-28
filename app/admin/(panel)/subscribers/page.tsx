import type { Metadata } from "next";
import { requireAdminPage } from "@/lib/admin-auth";
import { getMailConfig } from "@/lib/mail";
import { prisma } from "@/lib/prisma";
import Pagination from "@/components/pagination";
import { mailConfigComplete } from "@/lib/subscription";
import { MailSettingsForm, TestMailForm } from "./mail-forms";
import DeleteSubscriberButton from "./delete-subscriber-button";
import { displayEmail } from "@/lib/demo";
import { getAdminI18n } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const { m } = await getAdminI18n();
  return { title: m.admin.subscribers.metaTitle };
}
export const dynamic = "force-dynamic";

const PAGE_SIZE = 50;

export default async function AdminSubscribersPage({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  await requireAdminPage();
  const { m, f, num, date } = await getAdminI18n();
  const t = m.admin.subscribers;
  const formatDate = (value: Date) => date(value, { dateStyle: "medium", timeStyle: "short" });
  const { page: rawPage } = await searchParams;
  const [config, confirmed, pending] = await Promise.all([
    getMailConfig(),
    prisma.subscriber.count({ where: { confirmedAt: { not: null } } }),
    prisma.subscriber.count({ where: { confirmedAt: null } }),
  ]);
  const total = confirmed + pending;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const page = Math.min(Math.max(Number.parseInt(rawPage ?? "1", 10) || 1, 1), totalPages);
  const subscribers = await prisma.subscriber.findMany({
    orderBy: { createdAt: "desc" },
    skip: (page - 1) * PAGE_SIZE,
    take: PAGE_SIZE,
    select: { id: true, email: true, confirmedAt: true, createdAt: true },
  });
  const live = config.enabled && mailConfigComplete(config);

  return (
    <div className="max-w-4xl">
      <h1 className="text-2xl font-bold text-ink">{t.heading}</h1>
      <p className="mt-1 text-sm text-ink-3">{t.intro}</p>

      <div className="mt-6 grid gap-4 sm:grid-cols-3">
        <div className="rounded-3xl border border-line bg-surface p-5">
          <p className="text-xs text-ink-2">{t.status}</p>
          <p className={`mt-1.5 text-sm font-semibold ${live ? "text-emerald-600 dark:text-emerald-400" : "text-ink"}`}>{live ? t.on : t.off}</p>
        </div>
        <div className="rounded-3xl border border-line bg-surface p-5">
          <p className="text-xs text-ink-2">{t.confirmed}</p>
          <p className="mt-1.5 text-2xl font-extrabold text-ink">{num(confirmed)}</p>
        </div>
        <div className="rounded-3xl border border-line bg-surface p-5">
          <p className="text-xs text-ink-2">{t.pending}</p>
          <p className="mt-1.5 text-2xl font-extrabold text-ink">{num(pending)}</p>
          <p className="mt-1 text-xs text-ink-3">{t.pendingHint}</p>
        </div>
      </div>

      <section aria-labelledby="mail-settings" className="mt-6 rounded-3xl border border-line bg-surface p-5 sm:p-6">
        <h2 id="mail-settings" className="text-base font-semibold text-ink">{t.settingsHeading}</h2>
        <p className="mt-1 mb-4 text-xs text-ink-3">{t.settingsHint}</p>
        <MailSettingsForm
          initial={{
            enabled: config.enabled,
            host: config.host,
            port: config.port,
            secure: config.secure,
            user: config.user,
            hasPass: Boolean(config.pass),
            fromName: config.fromName,
            fromEmail: config.fromEmail,
          }}
        />
        <div className="mt-6 border-t border-line pt-5">
          <TestMailForm />
        </div>
      </section>

      <section aria-labelledby="subscriber-list" className="mt-6">
        <h2 id="subscriber-list" className="text-base font-semibold text-ink">{f(t.listHeading, { n: num(total) })}</h2>
        {subscribers.length === 0 ? (
          <div className="mt-3 rounded-3xl border border-dashed border-line bg-surface/60 py-12 text-center text-sm text-ink-3">{t.empty}</div>
        ) : (
          <div className="mt-3 overflow-x-auto rounded-2xl border border-line bg-surface">
            <table className="w-full text-sm">
              <thead className="border-b border-line text-left text-xs text-ink-3">
                <tr>
                  <th className="px-4 py-3 font-medium">{t.colEmail}</th>
                  <th className="px-4 py-3 font-medium">{t.colStatus}</th>
                  <th className="px-4 py-3 font-medium">{t.colDate}</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {subscribers.map((item) => (
                  <tr key={item.id}>
                    <td className="px-4 py-3 text-ink">{displayEmail(item.email)}</td>
                    <td className="px-4 py-3">
                      {item.confirmedAt ? (
                        <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-xs text-emerald-600 dark:text-emerald-400">{t.statusConfirmed}</span>
                      ) : (
                        <span className="rounded-full bg-amber-500/10 px-2 py-0.5 text-xs text-amber-600 dark:text-amber-400">{t.statusPending}</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-ink-2">{formatDate(item.createdAt)}</td>
                    <td className="px-4 py-3 text-right">
                      <DeleteSubscriberButton id={item.id} label={m.admin.common.delete} confirmText={f(t.deleteConfirm, { email: displayEmail(item.email) })} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <Pagination page={page} totalPages={totalPages} basePath="/admin/subscribers" labels={m.site.pagination} />
      </section>
    </div>
  );
}
