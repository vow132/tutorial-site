import type { Metadata } from "next";
import { notFound } from "next/navigation";
import IntentLink from "@/components/intent-link";
import JsonLd from "@/components/json-ld";
import Pagination from "@/components/pagination";
import Reveal from "@/components/reveal";
import TutorialCard from "@/components/tutorial-card";
import { getPublishedTags, getTagTutorialPage } from "@/lib/public-data";
import { breadcrumbJsonLd, pageMetadata, pageSuffix, withPage } from "@/lib/seo";
import { getSettings } from "@/lib/settings";
import { MIN_INDEXABLE_TAG_TUTORIALS, tagPath } from "@/lib/tags";
import { decodeSegment } from "@/lib/url";
import { getSiteI18n } from "@/lib/i18n/server";

const PAGE_SIZE = 9;

/** 只认有已发布教程的标签；其余（不存在、全是草稿）都是 404。 */
async function findTag(rawSlug: string) {
  const slug = decodeSegment(rawSlug);
  return slug ? (await getPublishedTags()).find((tag) => tag.slug === slug) ?? null : null;
}

export async function generateMetadata({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ page?: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const tag = await findTag(slug);
  // metadata 阶段就触发 404，保证流式传输开始前拿到真实 404 状态码。
  if (!tag) notFound();
  const { page: pageStr } = await searchParams;
  const [{ page }, settings, { m, f, plural }] = await Promise.all([
    getTagTutorialPage({ tag, page: Number(pageStr) || 1, pageSize: PAGE_SIZE }),
    getSettings(),
    getSiteI18n(),
  ]);
  const description = plural(tag.count, m.site.tags.tagDescription, { site: settings.siteName, name: tag.name });
  return pageMetadata({
    title: `${f(m.site.tags.tagTitle, { name: tag.name })}${pageSuffix(page, m.site.pageSuffix)}`,
    description: page > 1 ? `${description}${f(m.site.pageInDescription, { page })}` : description,
    path: withPage(tagPath(tag.slug), page),
    // 只有一篇教程的标签页内容太薄，不让收录，但链接照常可以跟随。
    index: tag.count >= MIN_INDEXABLE_TAG_TUTORIALS,
  });
}

export default async function TagPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ page?: string }>;
}) {
  const { slug } = await params;
  const tag = await findTag(slug);
  if (!tag) notFound();
  const { page: pageStr } = await searchParams;
  const [{ total, totalPages, page, tutorials }, { m, f, plural }] = await Promise.all([
    getTagTutorialPage({ tag, page: Number(pageStr) || 1, pageSize: PAGE_SIZE }),
    getSiteI18n(),
  ]);

  return (
    <div className="mx-auto max-w-6xl px-4 pt-14">
      <JsonLd
        data={breadcrumbJsonLd([
          { name: m.site.nav.home, path: "/" },
          { name: m.site.nav.allTags, path: "/tags" },
          { name: tag.name },
        ])}
      />
      <Reveal fade={false}>
        <nav className="mb-6 flex flex-wrap items-center gap-2 text-sm text-ink-3">
          <IntentLink href="/" className="transition-colors hover:text-accent">{m.site.nav.home}</IntentLink>
          <span>/</span>
          <IntentLink href="/tags" className="transition-colors hover:text-accent">{m.site.nav.allTags}</IntentLink>
          <span>/</span>
          <span className="text-ink-2">{tag.name}</span>
        </nav>
        <h1 className="text-3xl font-extrabold text-ink md:text-4xl">
          <span className="text-accent">#</span>
          {tag.name}
        </h1>
        <p className="mt-3 text-sm text-ink-2">{plural(total, m.site.tags.tagIntro)}</p>
      </Reveal>

      <div className="mt-10 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <h2 className="sr-only">{f(m.site.tags.tagListHeading, { name: tag.name })}</h2>
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

      <Pagination page={page} totalPages={totalPages} basePath={tagPath(tag.slug)} labels={m.site.pagination} />
    </div>
  );
}
