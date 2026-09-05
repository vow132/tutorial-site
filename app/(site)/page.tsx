import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { getSettings } from "@/lib/settings";
import { getHomeCategories } from "@/lib/public-data";
import {
  categoryLinkTarget,
  flattenCategoryTree,
  getCategoryHref,
} from "@/lib/categories";
import GlowCard from "@/components/glow-card";
import Reveal from "@/components/reveal";
import TutorialCard from "@/components/tutorial-card";

export default async function HomePage() {
  const [settings, categories, latest, tutorialCount, viewAgg] = await Promise.all([
    getSettings(),
    getHomeCategories(),
    prisma.tutorial.findMany({
      where: { published: true },
      orderBy: { createdAt: "desc" },
      take: 5,
      select: {
        id: true,
        title: true,
        slug: true,
        excerpt: true,
        views: true,
        createdAt: true,
        category: { select: { name: true, color: true } },
      },
    }),
    prisma.tutorial.count({ where: { published: true } }),
    prisma.tutorial.aggregate({ _sum: { views: true } }),
  ]);

  // 教程只归属自身分类，卡片仅显示该分类自身的教程数。
  const countCategoryTutorials = (
    category: (typeof categories)[number],
  ): number => category._count.tutorials;

  const stats = [
    { label: "精选教程", value: tutorialCount, unit: "篇", color: "var(--chart-indigo)" },
    {
      label: "教程分类",
      value: flattenCategoryTree(categories).length,
      unit: "个",
      color: "var(--chart-green)",
    },
    { label: "累计阅读", value: viewAgg._sum.views ?? 0, unit: "次", color: "var(--chart-amber)" },
  ];

  return (
    <div className="mx-auto max-w-6xl px-4">
      {/* ---------- Hero ---------- */}
      <section className="relative flex flex-col items-center pb-16 pt-20 text-center md:pt-28">
        {/* 低饱和靛蓝光晕，随主题取色；纯装饰 */}
        <div
          aria-hidden
          className="pointer-events-none absolute -top-24 left-1/2 h-80 w-[36rem] max-w-full -translate-x-1/2 rounded-full bg-accent/[0.07] blur-3xl"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute -top-10 right-[12%] h-40 w-64 max-w-full rounded-full bg-accent/[0.05] blur-3xl max-lg:hidden"
        />
        <Reveal>
          <span className="inline-flex items-center gap-2 rounded-full border border-line bg-surface px-4 py-1.5 text-xs font-medium text-ink-2">
            <span className="h-1.5 w-1.5 rounded-full bg-live" />
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
              <svg className="absolute -bottom-2 left-0 w-full text-accent/45" height="8" viewBox="0 0 200 8" preserveAspectRatio="none" aria-hidden="true">
                <path d="M2 6C60 1 140 1 198 6" stroke="currentColor" strokeWidth="4" strokeLinecap="round" fill="none" />
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
            className="group flex h-12 items-center gap-2 rounded-full bg-btn px-7 text-sm font-semibold text-white shadow-capsule transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lifted active:translate-y-0 active:scale-[0.98]"
          >
            开始学习
            <svg className="transition-transform duration-200 group-hover:translate-x-1" width="13" height="13" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden="true">
              <path d="M1.5 6h9M7 2.5L10.5 6 7 9.5" />
            </svg>
          </Link>
          <Link
            href="#categories"
            className="flex h-12 items-center rounded-full border border-line bg-surface px-7 text-sm font-semibold text-ink transition-all duration-200 hover:border-accent hover:text-accent active:scale-[0.98]"
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
        <Reveal mode="scroll">
          <div className="flex items-end justify-between">
            <div>
              <h2 className="text-2xl font-bold text-ink md:text-3xl">教程分类</h2>
              <p className="mt-2 text-sm text-ink-2">选一个方向，开始系统学习</p>
            </div>
          </div>
        </Reveal>
        <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {categories.map((c) => (
            <Reveal key={c.id} mode="scroll">
              <Link
                href={getCategoryHref(c)}
                {...categoryLinkTarget(getCategoryHref(c))}
                className="block h-full"
              >
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
                        {countCategoryTutorials(c)} 篇
                      </span>
                    </div>
                    <p className="mt-1.5 text-sm leading-relaxed text-ink-2 line-clamp-2">
                      {c.description ?? "暂无描述"}
                    </p>
                    {c.children.length > 0 && (
                      <p className="mt-2 text-xs text-accent">
                        包含 {c.children.length} 个子分类
                      </p>
                    )}
                  </div>
                </GlowCard>
              </Link>
            </Reveal>
          ))}
        </div>
      </section>

      {/* ---------- 最新教程 ---------- */}
      <section className="pt-20">
        <Reveal mode="scroll">
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
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden="true">
                <path d="M1.5 6h9M7 2.5L10.5 6 7 9.5" />
              </svg>
            </Link>
          </div>
        </Reveal>
        {/* 最新一篇作为横向大卡，其余 2×2 紧凑卡，与上方分类宫格区分层级 */}
        {latest[0] && (
          <Reveal mode="scroll" className="mt-8">
            <Link href={`/tutorials/${latest[0].slug}`} className="block">
              <GlowCard className="group flex h-full flex-col gap-5 p-6 sm:flex-row sm:items-center sm:justify-between md:p-8">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 text-xs text-ink-3">
                    <span
                      className="h-2 w-2 rounded-full"
                      style={{ backgroundColor: latest[0].category.color }}
                    />
                    <span
                      className="font-medium"
                      style={{ color: latest[0].category.color }}
                    >
                      {latest[0].category.name}
                    </span>
                    <span>·</span>
                    <time>
                      {latest[0].createdAt.toLocaleDateString("zh-CN", {
                        year: "numeric",
                        month: "short",
                        day: "numeric",
                      })}
                    </time>
                  </div>
                  <h3 className="mt-3 truncate text-xl font-bold text-ink transition-colors group-hover:text-accent md:text-2xl">
                    {latest[0].title}
                  </h3>
                  <p className="mt-2 max-w-2xl text-sm leading-relaxed text-ink-2 line-clamp-2">
                    {latest[0].excerpt ?? "暂无摘要"}
                  </p>
                </div>
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-line text-ink-2 transition-colors group-hover:border-accent group-hover:bg-accent-soft group-hover:text-accent">
                  <svg className="transition-transform duration-200 group-hover:translate-x-0.5" width="14" height="14" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden="true">
                    <path d="M1.5 6h9M7 2.5L10.5 6 7 9.5" />
                  </svg>
                </span>
              </GlowCard>
            </Link>
          </Reveal>
        )}
        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
          {latest.slice(1).map((t) => (
            <Reveal key={t.id} mode="scroll">
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
