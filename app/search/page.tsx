import type { Metadata } from "next";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { stripHtml } from "@/lib/article";
import GlowCard from "@/components/glow-card";
import Reveal from "@/components/reveal";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "搜索" };

function Highlight({ text, keyword }: { text: string; keyword: string }) {
  if (!keyword) return <>{text}</>;
  const parts = text.split(new RegExp(`(${keyword.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})`, "gi"));
  return (
    <>
      {parts.map((p, i) =>
        p.toLowerCase() === keyword.toLowerCase() ? (
          <mark key={i} className="rounded bg-yellow-100 px-0.5 text-ink">
            {p}
          </mark>
        ) : (
          p
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
        include: { category: true },
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
                  <span style={{ color: t.category.color }}>
                    {t.category.name}
                  </span>
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
