import type { Metadata } from "next";
import { prisma } from "@/lib/prisma";
import TutorialCard from "@/components/tutorial-card";
import Pagination from "@/components/pagination";
import Reveal from "@/components/reveal";

export const metadata: Metadata = { title: "全部教程" };

const PAGE_SIZE = 9;

export default async function TutorialsPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const { page: pageStr } = await searchParams;
  const page = Math.max(1, Number(pageStr) || 1);

  const [total, tutorials] = await Promise.all([
    prisma.tutorial.count({ where: { published: true } }),
    prisma.tutorial.findMany({
      where: { published: true },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      include: { category: true },
    }),
  ]);
  const totalPages = Math.ceil(total / PAGE_SIZE);

  return (
    <div className="mx-auto max-w-6xl px-4 pt-14">
      <Reveal>
        <span className="text-xs font-semibold uppercase tracking-widest text-accent">
          Tutorials
        </span>
        <h1 className="mt-2 text-3xl font-extrabold text-ink md:text-4xl">
          全部教程
        </h1>
        <p className="mt-3 text-sm text-ink-2">共 {total} 篇，持续更新中</p>
      </Reveal>

      {tutorials.length === 0 ? (
        <div className="mt-16 rounded-3xl border border-dashed border-line bg-white/60 py-20 text-center text-ink-3">
          暂无教程，敬请期待
        </div>
      ) : (
        <div className="mt-10 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {tutorials.map((t, i) => (
            <Reveal key={t.id} delay={Math.min(i, 5) * 0.05}>
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
      )}

      <Pagination page={page} totalPages={totalPages} basePath="/tutorials" />
    </div>
  );
}
