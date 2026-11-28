import type { Metadata } from "next";
import { getPublishedTags, getPublishedTutorialPage } from "@/lib/public-data";
import IntentLink from "@/components/intent-link";
import TagChips from "@/components/tag-chips";
import TutorialCard from "@/components/tutorial-card";
import Pagination from "@/components/pagination";
import Reveal from "@/components/reveal";

import { pageMetadata, pageSuffix, withPage } from "@/lib/seo";
import { getReaderI18n, getReaderSettings } from "@/lib/i18n/reader-server";

const PAGE_SIZE = 9;

export async function generateMetadata({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}): Promise<Metadata> {
  const { page: pageStr } = await searchParams;
  // 与页面相同的页码收敛规则（结果有缓存）：?page=999 的规范地址指向最后一页。
  const [{ page, total }, settings, { m, f, plural }] = await Promise.all([
    getPublishedTutorialPage({ page: Number(pageStr) || 1, pageSize: PAGE_SIZE }),
    getReaderSettings(),
    getReaderI18n(),
  ]);
  const description = plural(total, m.site.tutorials.description, { site: settings.siteName });
  return pageMetadata({
    title: `${m.site.tutorials.title}${pageSuffix(page, m.site.pageSuffix)}`,
    description: page > 1 ? `${description}${f(m.site.pageInDescription, { page })}` : description,
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
  const [{ total, totalPages, page, tutorials }, tags, { m, plural }] = await Promise.all([
    getPublishedTutorialPage({ page: Number(pageStr) || 1, pageSize: PAGE_SIZE }),
    getPublishedTags(),
    getReaderI18n(),
  ]);
  const t = m.site.tutorials;

  return (
    <div className="mx-auto max-w-6xl px-4 pt-14">
      <Reveal fade={false}>
        <h1 className="text-3xl font-extrabold text-ink md:text-4xl">
          {t.title}
        </h1>
        <p className="mt-3 text-sm text-ink-2">{plural(total, t.intro)}</p>
        {tags.length > 0 && (
          <div className="mt-6 flex flex-wrap items-center gap-x-3 gap-y-2">
            <span className="text-xs font-medium text-ink-3">{t.popularTags}</span>
            <TagChips label={t.popularTags} showCount tags={tags.slice(0, 12)} />
            {tags.length > 12 && (
              <IntentLink href="/tags" className="text-xs font-medium text-accent-ink hover:underline">
                {plural(tags.length, t.allTagsLink)}
              </IntentLink>
            )}
          </div>
        )}
      </Reveal>

      {tutorials.length === 0 ? (
        <div className="mt-16 rounded-3xl border border-dashed border-line bg-surface/60 py-20 text-center text-ink-3">
          {t.empty}
        </div>
      ) : (
        <div className="mt-10 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <h2 className="sr-only">{t.listHeading}</h2>
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
                thumbnail={t.thumbnail}
              />
            </Reveal>
          ))}
        </div>
      )}

      <Pagination page={page} totalPages={totalPages} basePath="/tutorials" labels={m.site.pagination} />
    </div>
  );
}
