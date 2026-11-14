import type { Metadata } from "next";
import { getPublishedTutorialPage } from "@/lib/public-data";
import TutorialCard from "@/components/tutorial-card";
import Pagination from "@/components/pagination";
import Reveal from "@/components/reveal";
import { getSettings } from "@/lib/settings";
import { pageMetadata, pageSuffix, withPage } from "@/lib/seo";

const PAGE_SIZE = 9;

export async function generateMetadata({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}): Promise<Metadata> {
  const { page: pageStr } = await searchParams;
  // 与页面相同的页码收敛规则（结果有缓存）：?page=999 的规范地址指向最后一页。
  const [{ page, total }, settings] = await Promise.all([
    getPublishedTutorialPage({ page: Number(pageStr) || 1, pageSize: PAGE_SIZE }),
    getSettings(),
  ]);
  const description = `${settings.siteName}全部 ${total} 篇图文教程，按发布时间排列，持续更新。`;
  return pageMetadata({
    title: `全部教程${pageSuffix(page)}`,
    description: page > 1 ? `${description}（第 ${page} 页）` : description,
    path: withPage("/tutorials", page),
  });
}

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
