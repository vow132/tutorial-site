import type { Metadata } from "next";
import { requireAdminPage } from "@/lib/admin-auth";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { getAlertConfig } from "@/lib/alerts";
import { describeBackup, getBackupStatus } from "@/lib/backup-status";
import { helpfulSummary, readRate } from "@/lib/feedback";
import { getSearchStats } from "@/lib/search-stats";
import { getTopTutorials, getTrafficSources, getViewTrend } from "@/lib/view-stats";
import GitHubUpdate from "./github-update";
import LaunchChecklist from "./launch-checklist";
import { getLaunchChecklist } from "@/lib/launch-checklist";
import { SearchInsights, TrafficSources } from "./reader-insights";
import ViewTrend from "./view-trend";
import { can, canEditTutorial, readRole } from "@/lib/roles";
import { getAdminI18n } from "@/lib/i18n/server";
import { rich } from "@/lib/i18n/rich";

export async function generateMetadata(): Promise<Metadata> {
  const { m } = await getAdminI18n();
  return { title: m.admin.dashboard.metaTitle };
}

export const dynamic = "force-dynamic";

export default async function AdminDashboard({
  searchParams,
}: {
  searchParams: Promise<{ sampleCleared?: string; forbidden?: string; welcome?: string }>;
}) {
  const admin = await requireAdminPage("dashboard");
  const { sampleCleared, forbidden, welcome } = await searchParams;
  // 上线检查清单、备份、告警、一键更新是站长的事；编辑、作者只看内容和阅读数据
  const isOwner = can(admin.role, "site");
  const i18n = await getAdminI18n();
  const { m, f, plural, num, date } = i18n;
  const t = m.admin.dashboard;
  const checklist = isOwner ? await getLaunchChecklist(admin.id, i18n) : [];
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
    hot,
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
      // 作者只看自己最近改过的（别人的教程他打不开）
      prisma.tutorial.findMany({
        where: can(admin.role, "tutorials.others") ? {} : { authorId: admin.id },
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

  // 作者看得到全站的热门教程，但只有自己的能点进编辑页（别人的链接到前台文章），别人已下线的不显示
  const top = hot.filter((item) => item.published || canEditTutorial(admin, item));
  const current = trend.slice(-30);
  const recentTotal = current.reduce((sum, day) => sum + day.views, 0);
  const previousTotal = trend.slice(0, -30).reduce((sum, day) => sum + day.views, 0);
  const change = previousTotal > 0 ? Math.round(((recentTotal - previousTotal) / previousTotal) * 100) : null;

  const { text: backupText, stale: backupStale } = describeBackup(backup, i18n);
  const alertLabel = m.admin.alertChannels[alertConfig.channel];

  const stats = [
    { label: t.statTotal, value: tutorialCount, color: "var(--chart-indigo)" },
    { label: t.statPublished, value: publishedCount, color: "var(--chart-green)" },
    { label: t.statDrafts, value: draftCount, color: "var(--chart-amber)" },
    { label: t.statCategories, value: categoryCount, color: "var(--chart-sky)" },
    { label: t.statViews, value: viewAgg._sum.views ?? 0, color: "var(--chart-pink)" },
  ];

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-ink">{t.heading}</h1>
          <p className="mt-1 text-sm text-ink-3">{t.intro}</p>
        </div>
        <div className="flex shrink-0 items-center gap-3">
          <Link
            href="/admin/tutorials/new"
            className="flex h-10 items-center gap-2 rounded-full bg-btn px-5 text-sm font-semibold text-white transition-opacity hover:opacity-90"
          >
            <svg width="13" height="13" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
              <path d="M7 1v12M1 7h12" />
            </svg>
            {t.newTutorial}
          </Link>
          {isOwner && <GitHubUpdate />}
        </div>
      </div>

      {welcome !== undefined && isOwner && (
        <p role="status" className="mt-6 rounded-xl bg-emerald-500/10 px-4 py-3 text-sm text-emerald-700 dark:text-emerald-300">
          {t.welcome}
        </p>
      )}
      {forbidden !== undefined && (
        <p role="alert" className="mt-6 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-700 dark:text-amber-300">
          {f(t.forbidden, { role: m.admin.roles[readRole(admin.role)].label })}
        </p>
      )}

      {sampleCleared !== undefined && (
        <p role="status" className="mt-6 rounded-xl bg-emerald-500/10 px-4 py-3 text-sm text-emerald-600 dark:text-emerald-400">
          {plural(Number(sampleCleared) || 0, t.sampleCleared)}
        </p>
      )}
      {isOwner && <LaunchChecklist items={checklist} t={m.admin.checklist} />}

      <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
        {stats.map((s) => (
          <div key={s.label} className="glow-card p-5">
            <p className="text-xs text-ink-2">{s.label}</p>
            <p className="mt-2 flex items-baseline gap-1.5">
              <span
                className="h-2 w-2 rounded-full"
                style={{ backgroundColor: s.color }}
              />
              <span className="text-2xl font-extrabold text-ink">{num(s.value)}</span>
            </p>
          </div>
        ))}
      </div>

      {/* 运维状态：备份停掉、告警没开都是长期运行里最容易被忽略的事故（只给站长看） */}
      {isOwner && (
      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <div
          className={`rounded-3xl border p-5 ${
            backupStale ? "border-amber-500/40 bg-amber-500/10" : "border-line bg-surface"
          }`}
        >
          <p className="text-xs text-ink-2">{t.lastBackup}</p>
          <p className={`mt-1.5 text-sm font-semibold ${backupStale ? "text-amber-700 dark:text-amber-300" : "text-ink"}`}>
            {backupText}
          </p>
          {backupStale && (
            <p className="mt-1.5 text-xs text-ink-3">
              {rich(t.backupStale, { command: <code>npm run backup</code> })}
            </p>
          )}
        </div>
        <div
          className={`rounded-3xl border p-5 ${
            alertConfig.channel === "off" ? "border-amber-500/40 bg-amber-500/10" : "border-line bg-surface"
          }`}
        >
          <p className="text-xs text-ink-2">{t.alerts}</p>
          <p className="mt-1.5 text-sm font-semibold text-ink">
            {alertConfig.channel === "off" ? t.alertsOff : f(t.alertsOn, { channel: alertLabel })}
          </p>
          <Link href="/admin/account#alerts" className="mt-1.5 inline-block text-xs text-accent-ink hover:underline">
            {alertConfig.channel === "off" ? t.alertsSetup : t.alertsEdit}
          </Link>
        </div>
      </div>
      )}

      {unreadMessages > 0 && can(admin.role, "feedback") && (
        <Link
          href="/admin/feedback"
          className="mt-4 flex items-center justify-between gap-3 rounded-3xl border border-accent/40 bg-accent-soft/60 px-5 py-4 text-sm transition-colors hover:bg-accent-soft"
        >
          <span className="text-ink">
            {plural(unreadMessages, t.unreadMessages)}
          </span>
          <span className="text-accent-ink">{t.goSee}</span>
        </Link>
      )}

      <section aria-labelledby="trend-heading" className="mt-10">
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          <h2 id="trend-heading" className="text-lg font-bold text-ink">{t.trendHeading}</h2>
          <p className="text-sm text-ink-2">
            <span className="font-semibold text-ink">{plural(recentTotal, t.trendTotal)}</span>
            {change !== null && (
              <span className="ml-2 text-ink-3">
                {f(t.trendChange, { arrow: change >= 0 ? "↑" : "↓", n: Math.abs(change) })}
              </span>
            )}
          </p>
        </div>
        <div className="mt-4 rounded-3xl border border-line bg-surface p-4 sm:p-5">
          {recentTotal === 0 ? (
            <p className="py-12 text-center text-sm text-ink-3">{t.trendEmpty}</p>
          ) : (
            <ViewTrend data={current} />
          )}
        </div>
      </section>

      <section aria-labelledby="top-heading" className="mt-10">
        <h2 id="top-heading" className="text-lg font-bold text-ink">{t.topHeading}</h2>
        <div className="mt-4 overflow-x-auto rounded-3xl border border-line bg-surface">
          {top.length === 0 ? (
            <p className="py-12 text-center text-sm text-ink-3">{t.noData}</p>
          ) : (
            <table className="w-full min-w-[680px] table-fixed text-sm">
              <thead>
                <tr className="border-b border-line text-left text-xs text-ink-3">
                  <th scope="col" className="w-12 py-3 pl-6 font-medium">#</th>
                  <th scope="col" className="py-3 pr-4 font-medium">{t.colTutorial}</th>
                  <th scope="col" className="w-24 py-3 pr-4 text-right font-medium">{t.colRecent}</th>
                  <th scope="col" className="w-20 py-3 pr-4 text-right font-medium">{t.colTotal}</th>
                  <th scope="col" className="w-20 py-3 pr-4 text-right font-medium" title={t.colCompletionHint}>
                    {t.colCompletion}
                  </th>
                  <th scope="col" className="w-44 py-3 pr-6 text-right font-medium">{t.colFeedback}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {top.map((item, index) => (
                  <tr key={item.id}>
                    <td className="py-3 pl-6 text-ink-3 tabular-nums">{index + 1}</td>
                    <td className="py-3 pr-4">
                      <Link
                        href={canEditTutorial(admin, item) ? `/admin/tutorials/${item.id}` : `/tutorials/${item.slug}`}
                        prefetch={false}
                        className="block truncate font-medium text-ink hover:text-accent-ink"
                      >
                        {item.title}
                      </Link>
                      {!item.published && <span className="text-xs text-amber-600 dark:text-amber-400">{t.offline}</span>}
                    </td>
                    <td className="py-3 pr-4 text-right font-semibold text-ink tabular-nums">{num(item.recentViews)}</td>
                    <td className="py-3 pr-4 text-right text-ink-2 tabular-nums">{num(item.totalViews)}</td>
                    <td className="py-3 pr-4 text-right text-ink-2 tabular-nums">
                      {readRate(item.recentViews, item.recentReads) === null ? "—" : `${readRate(item.recentViews, item.recentReads)}%`}
                    </td>
                    <td className="whitespace-nowrap py-3 pr-6 text-right text-xs text-ink-2">{helpfulSummary(item.helpfulYes, item.helpfulNo, i18n).text}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </section>

      <section aria-labelledby="sources-heading" className="mt-10">
        <h2 id="sources-heading" className="text-lg font-bold text-ink">{t.sourcesHeading}</h2>
        <div className="mt-4 rounded-3xl border border-line bg-surface p-5">
          <TrafficSources sources={sources} i18n={i18n} />
        </div>
      </section>

      <section aria-labelledby="search-heading" className="mt-10">
        <h2 id="search-heading" className="text-lg font-bold text-ink">{t.searchHeading}</h2>
        <div className="mt-4">
          <SearchInsights top={topSearches} missing={missingSearches} i18n={i18n} />
        </div>
      </section>

      <h2 className="mt-10 text-lg font-bold text-ink">{t.recentHeading}</h2>
      <div className="mt-4 overflow-hidden rounded-3xl border border-line bg-surface">
        {recent.length === 0 ? (
          <p className="py-16 text-center text-sm text-ink-3">
            {t.recentEmpty}
          </p>
        ) : (
          <ul className="divide-y divide-line">
            {recent.map((item) => (
              <li key={item.id}>
                <Link
                  href={`/admin/tutorials/${item.id}`}
                  className="flex items-center justify-between gap-4 px-6 py-4 transition-colors hover:bg-paper"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-ink">
                      {item.title}
                    </p>
                    <p className="mt-0.5 text-xs text-ink-3">
                      {f(t.updatedAt, { category: item.category.name, date: date(item.updatedAt) })}
                    </p>
                  </div>
                  <span
                    className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-medium ${
                      item.published
                        ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                        : "bg-amber-500/10 text-amber-600 dark:text-amber-400"
                    }`}
                  >
                    {item.published ? t.published : t.draft}
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
