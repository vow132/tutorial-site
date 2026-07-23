import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { processArticle } from "@/lib/article";
import { categoryLinkTarget, getCategoryHref } from "@/lib/categories";
import Toc from "@/components/toc";
import Reveal from "@/components/reveal";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug: rawSlug } = await params;
  const slug = decodeURIComponent(rawSlug);
  const t = await prisma.tutorial.findUnique({ where: { slug } });
  if (!t) return { title: "教程不存在" };
  return { title: t.title, description: t.excerpt ?? undefined };
}

export default async function TutorialDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug: rawSlug } = await params;
  const slug = decodeURIComponent(rawSlug);

  const tutorial = await prisma.tutorial.findUnique({
    where: { slug },
    include: { category: true },
  });
  if (!tutorial || !tutorial.published) notFound();

  // 阅读量 +1（异步执行，不阻塞渲染）
  prisma.tutorial
    .update({ where: { id: tutorial.id }, data: { views: { increment: 1 } } })
    .catch(() => {});

  // 上一篇 / 下一篇（同分类内按时间）
  const [prev, next] = await Promise.all([
    prisma.tutorial.findFirst({
      where: {
        published: true,
        categoryId: tutorial.categoryId,
        createdAt: { lt: tutorial.createdAt },
      },
      orderBy: { createdAt: "desc" },
      select: { title: true, slug: true },
    }),
    prisma.tutorial.findFirst({
      where: {
        published: true,
        categoryId: tutorial.categoryId,
        createdAt: { gt: tutorial.createdAt },
      },
      orderBy: { createdAt: "asc" },
      select: { title: true, slug: true },
    }),
  ]);

  const { html, toc } = processArticle(tutorial.content);
  const words = tutorial.content.replace(/<[^>]+>/g, "").length;
  const minutes = Math.max(1, Math.round(words / 400));

  return (
    <div className="mx-auto max-w-6xl px-4 pt-12">
      {/* 面包屑 */}
      <Reveal>
        <nav className="flex items-center gap-2 text-sm text-ink-3">
          <Link href="/" className="transition-colors hover:text-accent">首页</Link>
          <span>/</span>
          <Link
            href={getCategoryHref(tutorial.category)}
            {...categoryLinkTarget(getCategoryHref(tutorial.category))}
            className="transition-colors hover:text-accent"
          >
            {tutorial.category.name}
          </Link>
          <span>/</span>
          <span className="truncate text-ink-2">{tutorial.title}</span>
        </nav>
      </Reveal>

      <div className="mt-8 grid grid-cols-1 gap-10 lg:grid-cols-[minmax(0,1fr)_230px]">
        <div>
          {/* 头部 */}
          <Reveal>
            <header>
              <span
                className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium"
                style={{
                  backgroundColor: `${tutorial.category.color}14`,
                  color: tutorial.category.color,
                }}
              >
                <span
                  className="h-1.5 w-1.5 rounded-full"
                  style={{ backgroundColor: tutorial.category.color }}
                />
                {tutorial.category.name}
              </span>
              <h1 className="mt-4 text-3xl font-extrabold leading-tight text-ink md:text-4xl">
                {tutorial.title}
              </h1>
              <div className="mt-4 flex flex-wrap items-center gap-4 border-b border-line pb-6 text-xs text-ink-3">
                <span>
                  发布于{" "}
                  {tutorial.createdAt.toLocaleDateString("zh-CN", {
                    year: "numeric",
                    month: "long",
                    day: "numeric",
                  })}
                </span>
                <span>约 {minutes} 分钟读完</span>
                <span>{tutorial.views + 1} 次阅读</span>
              </div>
            </header>
          </Reveal>

          {/* 正文 */}
          <Reveal delay={0.1}>
            <article
              className="article-body mt-8"
              dangerouslySetInnerHTML={{ __html: html }}
            />
          </Reveal>

          {/* 上一篇 / 下一篇 */}
          <nav className="mt-14 grid grid-cols-1 gap-3 sm:grid-cols-2">
            {prev ? (
              <Link
                href={`/tutorials/${prev.slug}`}
                className="glow-card group p-5"
              >
                <span className="text-xs text-ink-3">← 上一篇</span>
                <p className="mt-1.5 truncate text-sm font-semibold text-ink transition-colors group-hover:text-accent">
                  {prev.title}
                </p>
              </Link>
            ) : (
              <span />
            )}
            {next && (
              <Link
                href={`/tutorials/${next.slug}`}
                className="glow-card group p-5 text-right"
              >
                <span className="text-xs text-ink-3">下一篇 →</span>
                <p className="mt-1.5 truncate text-sm font-semibold text-ink transition-colors group-hover:text-accent">
                  {next.title}
                </p>
              </Link>
            )}
          </nav>
        </div>

        {/* 目录 */}
        <Toc items={toc} />
      </div>
    </div>
  );
}
