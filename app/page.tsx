import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { getSettings } from "@/lib/settings";
import GlowCard from "@/components/glow-card";
import Reveal from "@/components/reveal";
import TutorialCard from "@/components/tutorial-card";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const [settings, categories, latest, tutorialCount, viewAgg] = await Promise.all([
    getSettings(),
    prisma.category.findMany({
      orderBy: { order: "asc" },
      include: { _count: { select: { tutorials: { where: { published: true } } } } },
    }),
    prisma.tutorial.findMany({
      where: { published: true },
      orderBy: { createdAt: "desc" },
      take: 6,
      include: { category: true },
    }),
    prisma.tutorial.count({ where: { published: true } }),
    prisma.tutorial.aggregate({ _sum: { views: true } }),
  ]);

  const stats = [
    { label: "精选教程", value: tutorialCount, unit: "篇", color: "#6366f1" },
    { label: "教程分类", value: categories.length, unit: "个", color: "#10b981" },
    { label: "累计阅读", value: viewAgg._sum.views ?? 0, unit: "次", color: "#f59e0b" },
  ];

  return (
    <div className="mx-auto max-w-6xl px-4">
      {/* ---------- Hero ---------- */}
      <section className="flex flex-col items-center pb-16 pt-20 text-center md:pt-28">
        <Reveal>
          <span className="inline-flex items-center gap-2 rounded-full border border-line bg-white px-4 py-1.5 text-xs font-medium text-ink-2">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
            {settings.heroBadge}
          </span>
        </Reveal>
        <Reveal delay={0.08}>
          <h1 className="mt-6 max-w-3xl text-4xl font-extrabold leading-tight tracking-tight text-ink md:text-6xl md:leading-[1.15]">
            {settings.heroTitleA}
            <br />
            {settings.heroTitleB}
            <span className="relative inline-block text-accent">
              {settings.heroAccent}
              <svg className="absolute -bottom-2 left-0 w-full" height="8" viewBox="0 0 200 8" preserveAspectRatio="none">
                <path d="M2 6C60 1 140 1 198 6" stroke="#c7d2fe" strokeWidth="4" strokeLinecap="round" fill="none" />
              </svg>
            </span>
          </h1>
        </Reveal>
        <Reveal delay={0.16}>
          <p className="mt-6 max-w-xl text-base leading-relaxed text-ink-2 md:text-lg">
            {settings.heroSubtitle}
          </p>
        </Reveal>
        <Reveal delay={0.24} className="mt-9 flex items-center gap-3">
          <Link
            href="/tutorials"
            className="flex h-12 items-center gap-2 rounded-full bg-ink px-7 text-sm font-semibold text-white transition-transform hover:scale-[1.03]"
          >
            开始学习
            <svg width="13" height="13" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
              <path d="M1.5 6h9M7 2.5L10.5 6 7 9.5" />
            </svg>
          </Link>
          <Link
            href="#categories"
            className="flex h-12 items-center rounded-full border border-line bg-white px-7 text-sm font-semibold text-ink transition-colors hover:border-accent hover:text-accent"
          >
            浏览分类
          </Link>
        </Reveal>
      </section>

      {/* ---------- 统计卡 ---------- */}
      <section className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {stats.map((s, i) => (
          <Reveal key={s.label} delay={i * 0.08}>
            <GlowCard className="p-6">
              <p className="text-sm text-ink-2">{s.label}</p>
              <p className="mt-2 flex items-baseline gap-1.5">
                <span
                  className="h-2.5 w-2.5 rounded-full"
                  style={{ backgroundColor: s.color }}
                />
                <span className="text-3xl font-extrabold text-ink">{s.value}</span>
                <span className="text-sm font-medium text-ink-3">{s.unit}</span>
              </p>
            </GlowCard>
          </Reveal>
        ))}
      </section>

      {/* ---------- 分类宫格 ---------- */}
      <section id="categories" className="scroll-mt-24 pt-20">
        <Reveal>
          <div className="flex items-end justify-between">
            <div>
              <h2 className="text-2xl font-bold text-ink md:text-3xl">教程分类</h2>
              <p className="mt-2 text-sm text-ink-2">选一个方向，开始系统学习</p>
            </div>
          </div>
        </Reveal>
        <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {categories.map((c, i) => (
            <Reveal key={c.id} delay={i * 0.06}>
              <Link href={`/categories/${c.slug}`} className="block h-full">
                <GlowCard className="flex h-full items-start gap-4 p-6">
                  <span
                    className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl text-2xl"
                    style={{ backgroundColor: `${c.color}14` }}
                  >
                    {c.icon ?? "📚"}
                  </span>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <h3 className="font-bold text-ink">{c.name}</h3>
                      <span className="rounded-full bg-paper px-2 py-0.5 text-xs text-ink-3">
                        {c._count.tutorials} 篇
                      </span>
                    </div>
                    <p className="mt-1.5 text-sm leading-relaxed text-ink-2 line-clamp-2">
                      {c.description ?? "暂无描述"}
                    </p>
                  </div>
                </GlowCard>
              </Link>
            </Reveal>
          ))}
        </div>
      </section>

      {/* ---------- 最新教程 ---------- */}
      <section className="pt-20">
        <Reveal>
          <div className="flex items-end justify-between">
            <div>
              <h2 className="text-2xl font-bold text-ink md:text-3xl">最新教程</h2>
              <p className="mt-2 text-sm text-ink-2">新鲜出炉，趁热阅读</p>
            </div>
            <Link
              href="/tutorials"
              className="hidden items-center gap-1.5 text-sm font-medium text-ink-2 transition-colors hover:text-accent sm:flex"
            >
              查看全部
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
                <path d="M1.5 6h9M7 2.5L10.5 6 7 9.5" />
              </svg>
            </Link>
          </div>
        </Reveal>
        <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {latest.map((t, i) => (
            <Reveal key={t.id} delay={i * 0.06}>
              <TutorialCard
                title={t.title}
                slug={t.slug}
                excerpt={t.excerpt}
                categoryName={t.category.name}
                categoryColor={t.category.color}
                views={t.views}
                createdAt={t.createdAt}
              />
            </Reveal>
          ))}
        </div>
      </section>
    </div>
  );
}
