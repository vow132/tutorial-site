import type { Metadata } from "next";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { stripHtml } from "@/lib/article";
import GlowCard from "@/components/glow-card";
import Reveal from "@/components/reveal";

export const metadata: Metadata = { title: "搜索" };

function Highlight({ text, keyword }: { text: string; keyword: string }) {
  if (!keyword) return <>{text}</>;
  const parts = text.split(
    new RegExp(`(${keyword.replace(/[.*+?^${}()|[\\]\\]/g, "\\$&")})`, "gi")
  );
  return (
    <>
      {parts.map((part, i) =>
        part.toLowerCase() === keyword.toLowerCase() ? (
          <mark key={i} className="rounded bg-yellow-100 px-0.5 text-ink">
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
  const query = (q ?? "").trim();

  const results = query
    ? await prisma.tutorial.findMany({
        where: {
          published: true,
          OR: [
            { title: { contains: query } },
            { excerpt: { contains: query } },
            { content: { contains: query } },
          ],
        },
        orderBy: { views: "desc" },
        take: 50,
        select: {
          id: true,
          title: true,
          slug: true,
          excerpt: true,
          content: true,
          views: true,
          category: { select: { name: true, color: true } },
        },
      })
    : [];

  return (
    <div className="mx-auto max-w-4xl px-4 pt-14">
      <Reveal>
        <span className="text-xs font-semibold uppercase tracking-widest text-accent">
          Search
        </span>
        <h1 className="mt-2 text-3xl font-extrabold text-ink md:text-4xl">
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
        className="mt-6 flex items-center gap-2 rounded-2xl border border-line bg-white/85 p-2 shadow-[0_8px_30px_-12px_rgba(23,24,28,0.18)] sm:hidden"
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
          strokeWidth="1.7"
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
          className="min-w-0 flex-1 bg-transparent px-1.5 py-2 text-sm text-ink outline-none placeholder:text-ink-3"
        />
        <button
          type="submit"
          className="h-9 shrink-0 rounded-xl bg-ink px-4 text-sm font-semibold text-white transition-opacity hover:opacity-90"
        >
          搜索
        </button>
      </form>

      {query && results.length === 0 && (
        <div className="mt-16 rounded-3xl border border-dashed border-line bg-white/60 py-20 text-center">
          <p className="text-4xl">🔍</p>
          <p className="mt-4 text-ink-2">没有找到相关教程，换个关键词试试</p>
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
