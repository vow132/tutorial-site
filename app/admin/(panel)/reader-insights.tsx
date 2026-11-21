import Link from "next/link";
import { describeSource, SOURCE_KIND_LABEL } from "@/lib/referrer";
import type { SearchStat } from "@/lib/search-stats";
import type { TrafficSource } from "@/lib/view-stats";

const MAX_SOURCES = 8;

/**
 * 近 30 天的阅读来源：按来源网站列出次数和占比（条形长度 = 占比），上方再按类别汇总一行。
 * 每一行都直接写着数字，不依赖颜色或悬停。
 */
export function TrafficSources({ sources }: { sources: TrafficSource[] }) {
  const total = sources.reduce((sum, item) => sum + item.views, 0);
  if (total === 0) {
    return <p className="py-10 text-center text-sm text-ink-3">还没有来源数据（从这次更新开始统计）</p>;
  }
  const shown = sources.slice(0, MAX_SOURCES);
  const rest = sources.slice(MAX_SOURCES).reduce((sum, item) => sum + item.views, 0);
  const rows = [
    ...shown.map((item) => ({ key: item.source, views: item.views, ...describeSource(item.source) })),
    ...(rest > 0 ? [{ key: "(rest)", views: rest, label: "其他", kind: "site" as const }] : []),
  ];
  const byKind = new Map<string, number>();
  for (const item of sources) {
    const { kind } = describeSource(item.source);
    byKind.set(kind, (byKind.get(kind) ?? 0) + item.views);
  }
  const share = (views: number) => Math.round((views / total) * 100);

  return (
    <div>
      <p className="text-xs text-ink-2">
        {[...byKind]
          .sort((a, b) => b[1] - a[1])
          .map(([kind, views]) => `${SOURCE_KIND_LABEL[kind as keyof typeof SOURCE_KIND_LABEL]} ${share(views)}%`)
          .join(" · ")}
      </p>
      <ul className="mt-4 space-y-3">
        {rows.map((row) => (
          <li key={row.key}>
            <div className="flex items-baseline justify-between gap-3 text-sm">
              <span className="min-w-0 truncate text-ink">
                {row.label}
                <span className="ml-2 text-xs text-ink-3">{SOURCE_KIND_LABEL[row.kind]}</span>
              </span>
              <span className="shrink-0 text-ink-2 tabular-nums">
                {row.views.toLocaleString("zh-CN")}
                <span className="ml-2 inline-block w-10 text-right text-xs text-ink-3">{share(row.views)}%</span>
              </span>
            </div>
            <div className="mt-1.5 h-2 rounded-full bg-accent-soft" aria-hidden="true">
              <div className="h-2 rounded-full" style={{ width: `${Math.max(1, share(row.views))}%`, backgroundColor: "var(--chart-trend)" }} />
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

function QueryTable({ rows, showResults }: { rows: SearchStat[]; showResults: boolean }) {
  return (
    <table className="w-full table-fixed text-sm">
      <thead>
        <tr className="border-b border-line text-left text-xs text-ink-3">
          <th scope="col" className="py-2 pr-3 font-medium">搜索词</th>
          <th scope="col" className="w-16 py-2 pr-3 text-right font-medium">次数</th>
          {showResults && <th scope="col" className="w-16 py-2 text-right font-medium">结果</th>}
        </tr>
      </thead>
      <tbody className="divide-y divide-line">
        {rows.map((row) => (
          <tr key={row.query}>
            <td className="truncate py-2 pr-3">
              <Link
                href={`/search?q=${encodeURIComponent(row.query)}`}
                prefetch={false}
                target="_blank"
                className="text-ink hover:text-accent-ink"
              >
                {row.query}
              </Link>
            </td>
            <td className="py-2 pr-3 text-right text-ink-2 tabular-nums">{row.count}</td>
            {showResults && (
              <td className={`py-2 text-right tabular-nums ${row.results === 0 ? "text-amber-600 dark:text-amber-400" : "text-ink-2"}`}>
                {row.results === 0 ? "无" : row.results}
              </td>
            )}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** 热门搜索 + 没找到结果的搜索（后者就是读者想看、站里还没有的内容）。 */
export function SearchInsights({ top, missing }: { top: SearchStat[]; missing: SearchStat[] }) {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <div className="rounded-3xl border border-line bg-surface p-5">
        <h3 className="text-sm font-semibold text-ink">热门搜索</h3>
        {top.length === 0 ? (
          <p className="py-8 text-center text-sm text-ink-3">还没有搜索记录</p>
        ) : (
          <div className="mt-2">
            <QueryTable rows={top} showResults />
          </div>
        )}
      </div>
      <div className="rounded-3xl border border-line bg-surface p-5">
        <h3 className="text-sm font-semibold text-ink">没找到结果的搜索</h3>
        <p className="mt-1 text-xs text-ink-3">读者想看、站里还没有的内容，可以当选题清单</p>
        {missing.length === 0 ? (
          <p className="py-8 text-center text-sm text-ink-3">暂无，读者搜的都找到了</p>
        ) : (
          <div className="mt-2">
            <QueryTable rows={missing} showResults={false} />
          </div>
        )}
      </div>
    </div>
  );
}
