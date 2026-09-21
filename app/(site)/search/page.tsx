import type { Metadata } from "next";
import Link from "next/link";
import { stripHtml } from "@/lib/article";
import { searchPublishedTutorials } from "@/lib/search";
import GlowCard from "@/components/glow-card";
import Mascot from "@/components/mascot";
import Reveal from "@/components/reveal";

export const metadata: Metadata = { title: "搜索" };

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
          <mark key={i} className="rounded bg-accent-soft px-0.5 text-accent">
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
  const results = await searchPublishedTutorials(query);

  return (
    <div className="mx-auto max-w-4xl px-4 pt-14">
      <Reveal>
        <h1 className="text-3xl font-extrabold text-ink md:text-4xl">
          {query ? (
            <>
              「<span className="text-accent">{query}</span>」的搜索结果
            </>
          ) : (
            "搜索教程"
          )}
        </h1>
        <p className="mt-3 text-sm text-ink-2">
          {query ? `共找到 ${results.length} 篇相关教程` : "在顶部输入关键词开始搜索"}
        </p>
      </Reveal>

      {/* 手机端顶部搜索框：点击导航搜索图标后可以直接输入并提交。 */}
      <form
        action="/search"
        method="get"
        className="mt-6 flex items-center gap-2 rounded-2xl border border-line bg-surface/85 p-2 shadow-capsule sm:hidden"
      >
        <label htmlFor="mobile-search-query" className="sr-only">
          搜索教程
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
          placeholder="搜索教程…"
          className="min-w-0 flex-1 bg-transparent px-1.5 py-2 text-sm text-ink outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent/60 rounded-lg placeholder:text-ink-3"
        />
        <button
          type="submit"
          className="h-9 shrink-0 rounded-xl bg-btn px-4 text-sm font-semibold text-white transition-opacity hover:opacity-90"
        >
          搜索
        </button>
      </form>

      {query && results.length === 0 && (
        <div className="mt-16 flex flex-col items-center rounded-3xl border border-dashed border-line bg-surface/60 py-16 text-center">
          <Mascot />
          <p className="mt-6 text-ink-2">没有找到相关教程，换个关键词试试</p>
        </div>
      )}

      <div className="mt-10 space-y-4">
        {results.map((t, i) => (
          <Reveal key={t.id} delay={Math.min(i, 5) * 0.05}>
            <Link href={`/tutorials/${t.slug}`} className="block">
              <GlowCard className="p-6">
                <div className="flex items-center gap-2 text-xs text-ink-3">
                  <span
                    className="h-2 w-2 rounded-full"
                    style={{ backgroundColor: t.category.color }}
                  />
                  <span style={{ color: t.category.color }}>{t.category.name}</span>
                  <span>·</span>
                  <span>{t.views} 阅读</span>
                </div>
                <h3 className="mt-2.5 text-lg font-bold text-ink">
                  <Highlight text={t.title} keyword={query} />
                </h3>
                <p className="mt-1.5 text-sm leading-relaxed text-ink-2 line-clamp-2">
                  <Highlight
                    text={t.excerpt ?? stripHtml(t.content, 140)}
                    keyword={query}
                  />
                </p>
              </GlowCard>
            </Link>
          </Reveal>
        ))}
      </div>
    </div>
  );
}
