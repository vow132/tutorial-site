import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import TutorialCard from "@/components/tutorial-card";
import Pagination from "@/components/pagination";
import Reveal from "@/components/reveal";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 9;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug: rawSlug } = await params;
  const slug = decodeURIComponent(rawSlug);
  const category = await prisma.category.findUnique({ where: { slug } });
  return { title: category ? `${category.name}教程` : "分类" };
}

export default async function CategoryPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ page?: string }>;
}) {
  const { slug: rawSlug } = await params;
  const slug = decodeURIComponent(rawSlug);
  const { page: pageStr } = await searchParams;
  const page = Math.max(1, Number(pageStr) || 1);

  const category = await prisma.category.findUnique({ where: { slug } });
  if (!category) notFound();

  const [total, tutorials] = await Promise.all([
    prisma.tutorial.count({
      where: { published: true, categoryId: category.id },
    }),
    prisma.tutorial.findMany({
      where: { published: true, categoryId: category.id },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
  ]);
  const totalPages = Math.ceil(total / PAGE_SIZE);

  return (
    <div className="mx-auto max-w-6xl px-4 pt-14">
      <Reveal>
        <div className="flex items-center gap-4">
          <span
            className="flex h-16 w-16 items-center justify-center rounded-3xl text-3xl"
            style={{ backgroundColor: `${category.color}14` }}
          >
            {category.icon ?? "📚"}
          </span>
          <div>
            <h1 className="text-3xl font-extrabold text-ink md:text-4xl">
              {category.name}
            </h1>
            <p className="mt-1.5 text-sm text-ink-2">
              {category.description ?? "暂无描述"} · 共 {total} 篇
            </p>
          </div>
        </div>
      </Reveal>

      {tutorials.length === 0 ? (
        <div className="mt-16 rounded-3xl border border-dashed border-line bg-white/60 py-20 text-center text-ink-3">
          该分类下暂无教程
        </div>
      ) : (
        <div className="mt-10 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {tutorials.map((t, i) => (
            <Reveal key={t.id} delay={Math.min(i, 5) * 0.05}>
              <TutorialCard
                title={t.title}
                slug={t.slug}
                excerpt={t.excerpt}
                categoryName={category.name}
                categoryColor={category.color}
                views={t.views}
                createdAt={t.createdAt}
              />
            </Reveal>
          ))}
        </div>
      )}

      <Pagination
        page={page}
        totalPages={totalPages}
        basePath={`/categories/${slug}`}
      />
    </div>
  );
}
