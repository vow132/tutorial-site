import type { Metadata } from "next";
import { requireAdminPage } from "@/lib/admin-auth";
import { getMailConfig } from "@/lib/mail";
import { prisma } from "@/lib/prisma";
import Pagination from "@/components/pagination";
import { mailConfigComplete } from "@/lib/subscription";
import { MailSettingsForm, TestMailForm } from "./mail-forms";
import DeleteSubscriberButton from "./delete-subscriber-button";
import { displayEmail } from "@/lib/demo";

export const metadata: Metadata = { title: "邮件订阅" };
export const dynamic = "force-dynamic";

const PAGE_SIZE = 50;

const formatDate = (date: Date) => date.toLocaleString("zh-CN", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Shanghai" });

export default async function AdminSubscribersPage({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  await requireAdminPage();
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
      <h1 className="text-2xl font-bold text-ink">邮件订阅</h1>
      <p className="mt-1 text-sm text-ink-3">
        读者留下邮箱并点确认邮件里的链接后，每篇新教程发布（包括定时发布）时会自动收到一封提醒，每篇只发一次，邮件里带一键退订。
      </p>

      <div className="mt-6 grid gap-4 sm:grid-cols-3">
        <div className="rounded-3xl border border-line bg-surface p-5">
          <p className="text-xs text-ink-2">状态</p>
          <p className={`mt-1.5 text-sm font-semibold ${live ? "text-emerald-600 dark:text-emerald-400" : "text-ink"}`}>{live ? "已开启" : "未开启"}</p>
        </div>
        <div className="rounded-3xl border border-line bg-surface p-5">
          <p className="text-xs text-ink-2">已确认的订阅者</p>
          <p className="mt-1.5 text-2xl font-extrabold text-ink">{confirmed}</p>
        </div>
        <div className="rounded-3xl border border-line bg-surface p-5">
          <p className="text-xs text-ink-2">等待确认</p>
          <p className="mt-1.5 text-2xl font-extrabold text-ink">{pending}</p>
          <p className="mt-1 text-xs text-ink-3">7 天内没确认会自动清除</p>
        </div>
      </div>

      <section aria-labelledby="mail-settings" className="mt-6 rounded-3xl border border-line bg-surface p-5 sm:p-6">
        <h2 id="mail-settings" className="text-base font-semibold text-ink">发信设置</h2>
        <p className="mt-1 mb-4 text-xs text-ink-3">
          需要一个能用 SMTP 发信的邮箱服务，例如阿里云邮件推送、腾讯云 SES，或企业邮箱的 SMTP。发件人域名最好配置 SPF/DKIM，否则容易进垃圾箱。配置加密保存，密码不会显示在页面上。
        </p>
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
        <h2 id="subscriber-list" className="text-base font-semibold text-ink">订阅者（{total}）</h2>
        {subscribers.length === 0 ? (
          <div className="mt-3 rounded-3xl border border-dashed border-line bg-surface/60 py-12 text-center text-sm text-ink-3">还没有订阅者</div>
        ) : (
          <div className="mt-3 overflow-x-auto rounded-2xl border border-line bg-surface">
            <table className="w-full text-sm">
              <thead className="border-b border-line text-left text-xs text-ink-3">
                <tr>
                  <th className="px-4 py-3 font-medium">邮箱</th>
                  <th className="px-4 py-3 font-medium">状态</th>
                  <th className="px-4 py-3 font-medium">订阅时间</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {subscribers.map((item) => (
                  <tr key={item.id}>
                    <td className="px-4 py-3 text-ink">{displayEmail(item.email)}</td>
                    <td className="px-4 py-3">
                      {item.confirmedAt ? (
                        <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-xs text-emerald-600 dark:text-emerald-400">已确认</span>
                      ) : (
                        <span className="rounded-full bg-amber-500/10 px-2 py-0.5 text-xs text-amber-600 dark:text-amber-400">等待确认</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-ink-2">{formatDate(item.createdAt)}</td>
                    <td className="px-4 py-3 text-right">
                      <DeleteSubscriberButton id={item.id} email={displayEmail(item.email)} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <Pagination page={page} totalPages={totalPages} basePath="/admin/subscribers" />
      </section>
    </div>
  );
}
