import type { Metadata } from "next";
import { getPublishedTutorialPage } from "@/lib/public-data";
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

  // 页码收敛到合法区间，避免 ?page=999 渲染出误导性的空状态；结果有缓存。
  const { total, totalPages, page, tutorials } = await getPublishedTutorialPage({
    page: Number(pageStr) || 1,
    pageSize: PAGE_SIZE,
  });

  return (
    <div className="mx-auto max-w-6xl px-4 pt-14">
      <Reveal fade={false}>
        <h1 className="text-3xl font-extrabold text-ink md:text-4xl">
          全部教程
        </h1>
        <p className="mt-3 text-sm text-ink-2">共 {total} 篇，持续更新中</p>
      </Reveal>

      {tutorials.length === 0 ? (
        <div className="mt-16 rounded-3xl border border-dashed border-line bg-surface/60 py-20 text-center text-ink-3">
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
