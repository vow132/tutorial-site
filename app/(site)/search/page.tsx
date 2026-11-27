import type { Metadata } from "next";
import IntentLink from "@/components/intent-link";
import { getClientIp, getUserAgent } from "@/lib/client-ip";
import { recordSearch } from "@/lib/search-stats";
import { sharedLimiter } from "@/lib/rate-limit";
import { SearchBusyError, isShortQuery, searchPublishedTutorials } from "@/lib/search";
import GlowCard from "@/components/glow-card";
import Mascot from "@/components/mascot";
import Reveal from "@/components/reveal";
import { categoryTextStyle } from "@/lib/color";
import { getSiteI18n } from "@/lib/i18n/server";
import { rich } from "@/lib/i18n/rich";

// 搜索结果页是无限组合的薄内容：不收录，但允许爬虫顺着结果链接抓取教程。
// 不能在 robots.txt 里禁止 /search，否则爬虫看不到这里的 noindex。
export async function generateMetadata(): Promise<Metadata> {
  const { m } = await getSiteI18n();
  return { title: m.site.search.title, robots: { index: false, follow: true } };
}

/**
 * 转义正则元字符。
 *
 * 字符类里 `]` 必须写成 `\]`，否则字符类会提前闭合、转义整体失效——
 * 搜索 `c++`、`(from`、`cache)` 这类关键词就会让 new RegExp 抛错，整页 500。
 */
function escapeRegExp(input: string) {
  return input.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function Highlight({ text, keyword }: { text: string; keyword: string }) {
  if (!keyword) return <>{text}</>;
  const parts = text.split(new RegExp(`(${escapeRegExp(keyword)})`, "gi"));
  return (
    <>
      {parts.map((part, i) =>
        part.toLowerCase() === keyword.toLowerCase() ? (
          <mark key={i} className="rounded bg-accent-soft px-0.5 text-accent-ink">
            {part}
          </mark>
        ) : (
          part
        )
      )}
    </>
  );
}

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q } = await searchParams;
  const query = (q ?? "").trim().slice(0, 100);
  const { m, plural } = await getSiteI18n();
  const t = m.site.search;

  // 配置了 TRUST_PROXY 能拿到真实 IP 时，单个 IP 每分钟最多 30 次搜索。
  const ip = query ? await getClientIp() : null;
  const limiter = sharedLimiter("search:ip", 30, 60_000);
  const throttled = ip ? limiter.retryAfter(ip) > 0 : false;
  if (ip && !throttled) limiter.hit(ip);
  // 全站搜索繁忙（见 lib/search.ts 的全站预算）时不报错，只提示稍后再试。
  const outcome = throttled
    ? { results: [], busy: false }
    : await searchPublishedTutorials(query).then(
        (results) => ({ results, busy: false }),
        (error: unknown) => {
          if (error instanceof SearchBusyError) return { results: [], busy: true };
          throw error;
        },
      );
  const { results, busy } = outcome;
  // 搜索词统计（后台仪表盘的「热门搜索」「没找到结果的搜索」）；只记真正执行了的搜索
  if (query && !throttled && !busy) recordSearch(query, results.length, { ip, userAgent: await getUserAgent() });

  return (
    <div className="mx-auto max-w-4xl px-4 pt-14">
      <Reveal fade={false}>
        <h1 className="text-3xl font-extrabold text-ink md:text-4xl">
          {query ? rich(t.resultsFor, { query: <span className="text-accent">{query}</span> }) : t.heading}
        </h1>
        <p className="mt-3 text-sm text-ink-2">
          {throttled ? t.rateLimited : busy ? t.busy : query ? plural(results.length, t.found) : t.hint}
        </p>
        {query && !throttled && !busy && isShortQuery(query) && (
          <p className="mt-1 text-xs text-ink-3">
            {t.shortQueryNote}
          </p>
        )}
      </Reveal>

      {/* 手机端顶部搜索框：点击导航搜索图标后可以直接输入并提交。 */}
      <form
        action="/search"
        method="get"
        className="mt-6 flex items-center gap-2 rounded-2xl border border-line bg-surface/85 p-2 shadow-capsule sm:hidden"
      >
        <label htmlFor="mobile-search-query" className="sr-only">
          {t.heading}
        </label>
        <svg
          width="17"
          height="17"
          viewBox="0 0 17 17"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
          className="ml-2 shrink-0 text-ink-3"
          aria-hidden="true"
        >
          <circle cx="7.25" cy="7.25" r="4.75" />
          <path d="m10.75 10.75 3.75 3.75" />
        </svg>
        <input
          id="mobile-search-query"
          name="q"
          type="search"
          inputMode="search"
          enterKeyHint="search"
          defaultValue={query}
          placeholder={t.placeholder}
          className="min-w-0 flex-1 bg-transparent px-1.5 py-2 text-sm text-ink outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent/60 rounded-lg placeholder:text-ink-3"
        />
        <button
          type="submit"
          className="h-9 shrink-0 rounded-xl bg-btn px-4 text-sm font-semibold text-white transition-opacity hover:opacity-90"
        >
          {t.submit}
        </button>
      </form>

      {query && !throttled && !busy && results.length === 0 && (
        <div className="mt-16 flex flex-col items-center rounded-3xl border border-dashed border-line bg-surface/60 py-16 text-center">
          <Mascot />
          <p className="mt-6 text-ink-2">{t.noResults}</p>
        </div>
      )}

      <div className="mt-10 space-y-4">
        {results.length > 0 && <h2 className="sr-only">{t.resultsHeading}</h2>}
        {results.map((item, i) => (
          <Reveal key={item.id} delay={Math.min(i, 5) * 0.05}>
            <IntentLink href={`/tutorials/${item.slug}`} className="block">
              <GlowCard className="p-6">
                <div className="flex items-center gap-2 text-xs text-ink-3">
                  <span
                    className="h-2 w-2 rounded-full"
                    style={{ backgroundColor: item.category.color }}
                  />
                  <span className="cat-text" style={categoryTextStyle(item.category.color)}>{item.category.name}</span>
                  <span>·</span>
                  <span>{plural(item.views, m.site.views)}</span>
                </div>
                <h3 className="mt-2.5 text-lg font-bold text-ink">
                  <Highlight text={item.title} keyword={query} />
                </h3>
                <p className="mt-1.5 text-sm leading-relaxed text-ink-2 line-clamp-2">
                  <Highlight text={item.snippet} keyword={query} />
                </p>
              </GlowCard>
            </IntentLink>
          </Reveal>
        ))}
      </div>
    </div>
  );
}
