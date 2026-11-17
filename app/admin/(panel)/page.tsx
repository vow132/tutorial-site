import type { Metadata } from "next";
import { requireAdminPage } from "@/lib/admin-auth";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { getAlertConfig } from "@/lib/alerts";
import { ALERT_CHANNELS } from "@/lib/alert-channels.mjs";
import { describeBackup, getBackupStatus } from "@/lib/backup-status";
import GitHubUpdate from "./github-update";

export const metadata: Metadata = { title: "仪表盘" };

export const dynamic = "force-dynamic";

export default async function AdminDashboard() {
  await requireAdminPage();
  const [tutorialCount, publishedCount, draftCount, categoryCount, viewAgg, recent, backup, alertConfig] =
    await Promise.all([
      prisma.tutorial.count(),
      prisma.tutorial.count({ where: { published: true } }),
      prisma.tutorial.count({ where: { published: false } }),
      prisma.category.count(),
      prisma.tutorial.aggregate({ _sum: { views: true } }),
      prisma.tutorial.findMany({
        orderBy: { updatedAt: "desc" },
        take: 5,
        select: {
          id: true,
          title: true,
          published: true,
          updatedAt: true,
          category: { select: { name: true } },
        },
      }),
      getBackupStatus(),
      getAlertConfig(),
    ]);

  const { text: backupText, stale: backupStale } = describeBackup(backup);
  const alertLabel = ALERT_CHANNELS.find((item) => item.value === alertConfig.channel)?.label;

  const stats = [
    { label: "教程总数", value: tutorialCount, color: "var(--chart-indigo)" },
    { label: "已发布", value: publishedCount, color: "var(--chart-green)" },
    { label: "草稿", value: draftCount, color: "var(--chart-amber)" },
    { label: "分类", value: categoryCount, color: "var(--chart-sky)" },
    { label: "总阅读量", value: viewAgg._sum.views ?? 0, color: "var(--chart-pink)" },
  ];

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-ink">仪表盘</h1>
          <p className="mt-1 text-sm text-ink-3">内容数据一览</p>
        </div>
        <div className="flex shrink-0 items-center gap-3">
          <Link
            href="/admin/tutorials/new"
            className="flex h-10 items-center gap-2 rounded-full bg-btn px-5 text-sm font-semibold text-white transition-opacity hover:opacity-90"
          >
            <svg width="13" height="13" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
              <path d="M7 1v12M1 7h12" />
            </svg>
            写教程
          </Link>
          <GitHubUpdate />
        </div>
      </div>

      <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
        {stats.map((s) => (
          <div key={s.label} className="glow-card p-5">
            <p className="text-xs text-ink-2">{s.label}</p>
            <p className="mt-2 flex items-baseline gap-1.5">
              <span
                className="h-2 w-2 rounded-full"
                style={{ backgroundColor: s.color }}
              />
              <span className="text-2xl font-extrabold text-ink">{s.value}</span>
            </p>
          </div>
        ))}
      </div>

      {/* 运维状态：备份停掉、告警没开都是长期运行里最容易被忽略的事故 */}
      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <div
          className={`rounded-3xl border p-5 ${
            backupStale ? "border-amber-500/40 bg-amber-500/10" : "border-line bg-surface"
          }`}
        >
          <p className="text-xs text-ink-2">上次数据库备份</p>
          <p className={`mt-1.5 text-sm font-semibold ${backupStale ? "text-amber-700 dark:text-amber-300" : "text-ink"}`}>
            {backupText}
          </p>
          {backupStale && (
            <p className="mt-1.5 text-xs text-ink-3">
              超过 2 天没有新备份。请在服务器 crontab 里每天执行 <code>npm run backup</code>，并同步到异地。
            </p>
          )}
        </div>
        <div
          className={`rounded-3xl border p-5 ${
            alertConfig.channel === "off" ? "border-amber-500/40 bg-amber-500/10" : "border-line bg-surface"
          }`}
        >
          <p className="text-xs text-ink-2">安全告警</p>
          <p className="mt-1.5 text-sm font-semibold text-ink">
            {alertConfig.channel === "off" ? "未开启" : `已开启 · ${alertLabel}`}
          </p>
          <Link href="/admin/account#alerts" className="mt-1.5 inline-block text-xs text-accent-ink hover:underline">
            {alertConfig.channel === "off" ? "去设置，新设备登录等情况会推送到手机 →" : "修改告警设置 →"}
          </Link>
        </div>
      </div>

      <h2 className="mt-10 text-lg font-bold text-ink">最近更新</h2>
      <div className="mt-4 overflow-hidden rounded-3xl border border-line bg-surface">
        {recent.length === 0 ? (
          <p className="py-16 text-center text-sm text-ink-3">
            还没有教程，点击右上角「写教程」开始创作
          </p>
        ) : (
          <ul className="divide-y divide-line">
            {recent.map((t) => (
              <li key={t.id}>
                <Link
                  href={`/admin/tutorials/${t.id}`}
                  className="flex items-center justify-between gap-4 px-6 py-4 transition-colors hover:bg-paper"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-ink">
                      {t.title}
                    </p>
                    <p className="mt-0.5 text-xs text-ink-3">
                      {t.category.name} · 更新于{" "}
                      {t.updatedAt.toLocaleDateString("zh-CN")}
                    </p>
                  </div>
                  <span
                    className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-medium ${
                      t.published
                        ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                        : "bg-amber-500/10 text-amber-600 dark:text-amber-400"
                    }`}
                  >
                    {t.published ? "已发布" : "草稿"}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
