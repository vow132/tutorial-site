import type { Metadata } from "next";
import { requireAdminPage } from "@/lib/admin-auth";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { getAlertConfig } from "@/lib/alerts";
import { ALERT_CHANNELS } from "@/lib/alert-channels.mjs";
import { describeBackup, getBackupStatus } from "@/lib/backup-status";
import { helpfulSummary, readRate } from "@/lib/feedback";
import { getSearchStats } from "@/lib/search-stats";
import { getTopTutorials, getTrafficSources, getViewTrend } from "@/lib/view-stats";
import GitHubUpdate from "./github-update";
import { SearchInsights, TrafficSources } from "./reader-insights";
import ViewTrend from "./view-trend";

export const metadata: Metadata = { title: "仪表盘" };

export const dynamic = "force-dynamic";

export default async function AdminDashboard() {
  await requireAdminPage();
  const [
    tutorialCount,
    publishedCount,
    draftCount,
    categoryCount,
    viewAgg,
    recent,
    backup,
    alertConfig,
    trend,
    top,
    sources,
    topSearches,
    missingSearches,
    unreadMessages,
  ] = await Promise.all([
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
      // 取 60 天：后 30 天画图，前 30 天用来算环比
      getViewTrend(60),
      getTopTutorials(30, 10),
      getTrafficSources(30),
      getSearchStats(30, 10),
      getSearchStats(30, 10, true),
      prisma.feedbackMessage.count({ where: { read: false } }),
    ]);

  const current = trend.slice(-30);
  const recentTotal = current.reduce((sum, day) => sum + day.views, 0);
  const previousTotal = trend.slice(0, -30).reduce((sum, day) => sum + day.views, 0);
  const change = previousTotal > 0 ? Math.round(((recentTotal - previousTotal) / previousTotal) * 100) : null;

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

      {unreadMessages > 0 && (
        <Link
          href="/admin/feedback"
          className="mt-4 flex items-center justify-between gap-3 rounded-3xl border border-accent/40 bg-accent-soft/60 px-5 py-4 text-sm transition-colors hover:bg-accent-soft"
        >
          <span className="text-ink">
            有 <span className="font-semibold">{unreadMessages}</span> 条未读的读者留言
          </span>
          <span className="text-accent-ink">去看看 →</span>
        </Link>
      )}

      <section aria-labelledby="trend-heading" className="mt-10">
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          <h2 id="trend-heading" className="text-lg font-bold text-ink">近 30 天阅读</h2>
          <p className="text-sm text-ink-2">
            共 <span className="font-semibold text-ink">{recentTotal.toLocaleString("zh-CN")}</span> 次
            {change !== null && (
              <span className="ml-2 text-ink-3">
                比前 30 天 {change >= 0 ? "↑" : "↓"} {Math.abs(change)}%
              </span>
            )}
          </p>
        </div>
        <div className="mt-4 rounded-3xl border border-line bg-surface p-4 sm:p-5">
          {recentTotal === 0 ? (
            <p className="py-12 text-center text-sm text-ink-3">最近 30 天还没有阅读记录（从这次更新开始按天统计）</p>
          ) : (
            <ViewTrend data={current} />
          )}
        </div>
      </section>

      <section aria-labelledby="top-heading" className="mt-10">
        <h2 id="top-heading" className="text-lg font-bold text-ink">近 30 天热门教程</h2>
        <div className="mt-4 overflow-x-auto rounded-3xl border border-line bg-surface">
          {top.length === 0 ? (
            <p className="py-12 text-center text-sm text-ink-3">暂无数据</p>
          ) : (
            <table className="w-full min-w-[680px] table-fixed text-sm">
              <thead>
                <tr className="border-b border-line text-left text-xs text-ink-3">
                  <th scope="col" className="w-12 py-3 pl-6 font-medium">#</th>
                  <th scope="col" className="py-3 pr-4 font-medium">教程</th>
                  <th scope="col" className="w-24 py-3 pr-4 text-right font-medium">近 30 天</th>
                  <th scope="col" className="w-20 py-3 pr-4 text-right font-medium">累计</th>
                  <th scope="col" className="w-20 py-3 pr-4 text-right font-medium" title="读到文末并停留 10 秒以上的比例；近 30 天阅读少于 10 次时不显示">
                    读完率
                  </th>
                  <th scope="col" className="w-44 py-3 pr-6 text-right font-medium">读者反馈</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {top.map((t, index) => (
                  <tr key={t.id}>
                    <td className="py-3 pl-6 text-ink-3 tabular-nums">{index + 1}</td>
                    <td className="py-3 pr-4">
                      <Link href={`/admin/tutorials/${t.id}`} className="block truncate font-medium text-ink hover:text-accent-ink">
                        {t.title}
                      </Link>
                      {!t.published && <span className="text-xs text-amber-600 dark:text-amber-400">已下线</span>}
                    </td>
                    <td className="py-3 pr-4 text-right font-semibold text-ink tabular-nums">{t.recentViews.toLocaleString("zh-CN")}</td>
                    <td className="py-3 pr-4 text-right text-ink-2 tabular-nums">{t.totalViews.toLocaleString("zh-CN")}</td>
                    <td className="py-3 pr-4 text-right text-ink-2 tabular-nums">
                      {readRate(t.recentViews, t.recentReads) === null ? "—" : `${readRate(t.recentViews, t.recentReads)}%`}
                    </td>
                    <td className="whitespace-nowrap py-3 pr-6 text-right text-xs text-ink-2">{helpfulSummary(t.helpfulYes, t.helpfulNo).text}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </section>

      <section aria-labelledby="sources-heading" className="mt-10">
        <h2 id="sources-heading" className="text-lg font-bold text-ink">近 30 天阅读来源</h2>
        <div className="mt-4 rounded-3xl border border-line bg-surface p-5">
          <TrafficSources sources={sources} />
        </div>
      </section>

      <section aria-labelledby="search-heading" className="mt-10">
        <h2 id="search-heading" className="text-lg font-bold text-ink">近 30 天读者在搜什么</h2>
        <div className="mt-4">
          <SearchInsights top={topSearches} missing={missingSearches} />
        </div>
      </section>

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
