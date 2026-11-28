import type { Metadata } from "next";
import IntentLink from "@/components/intent-link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { htmlToDescription, processArticle, uploadedImage } from "@/lib/article";
import { categoryLinkTarget, getCategoryHref } from "@/lib/categories";
import { getPublishedTutorial } from "@/lib/tutorial-data";
import { RELATED_TUTORIAL_LIMIT, getPublishedSeries, getRelatedTutorialCandidates } from "@/lib/public-data";
import { seriesPath, seriesPosition } from "@/lib/series";
import { decodeSegment } from "@/lib/url";

import { absoluteUrl } from "@/lib/site-url";
import { breadcrumbJsonLd, pageMetadata, toAbsolute } from "@/lib/seo";
import { SHARE_IMAGE_SIZE, shareImagePath } from "@/lib/share-image";
import JsonLd from "@/components/json-ld";
import GlowCard from "@/components/glow-card";
import Toc, { MobileToc } from "@/components/toc";
import Reveal from "@/components/reveal";
import TutorialCard from "@/components/tutorial-card";
import ViewBeacon from "@/components/view-beacon";
import ReadingProgress from "@/components/reading-progress";
import ArticleEnhancer from "@/components/article-enhancer";
import { categoryTextStyle } from "@/lib/color";
import TagChips from "@/components/tag-chips";
import SeriesBook from "@/components/series-book";
import HelpfulFeedback from "@/components/helpful-feedback";
import ShareButtons from "@/components/share-buttons";
import SupportBox from "@/components/support-box";
import Comments from "@/components/comments";
import { isDemoMode } from "@/lib/demo";
import SubscribeForm from "@/components/subscribe-form";
import { getSubscriptionEnabled } from "@/lib/mail";
import { getTurnstileSiteKey } from "@/lib/turnstile-store";
import { bylineOf } from "@/lib/roles";
import { assetSrcSet, assetUrl, rewriteAssetHtml } from "@/lib/asset-url";

import { READING_CHARS_PER_MINUTE } from "@/lib/i18n/locales";
import { getReaderI18n, getReaderSettings } from "@/lib/i18n/reader-server";

/**
 * 文章页是 ISR 缓存页：首次访问时生成，之后直接返回缓存 HTML，每分钟最多在后台
 * 重新生成一次（页面上的阅读量最多滞后这么久）；后台修改教程/分类/设置时立即失效
 * （见 lib/actions）。因此页面里不能读 headers()/cookies()，阅读量改由浏览器上报（ViewBeacon）。
 * 周期取 1 分钟：如果某次重新生成恰好跨过后台的修改，旧内容最多保留 1 分钟。
 */
export const revalidate = 60;

/** 返回空数组：构建时不预生成，每篇文章在第一次被访问时生成并缓存。 */
export function generateStaticParams() {
  return [];
}

const LONG_DATE: Intl.DateTimeFormatOptions = { year: "numeric", month: "long", day: "numeric" };

type PublishedTutorial = NonNullable<Awaited<ReturnType<typeof getPublishedTutorial>>>;

const tutorialPath = (slug: string) => `/tutorials/${encodeURIComponent(slug)}`;

/** 摘要优先；没写摘要时取正文开头（已过滤的 HTML），再不行用标题。 */
function describe(tutorial: PublishedTutorial, html: string) {
  return tutorial.excerpt?.trim() || htmlToDescription(html) || tutorial.title;
}

/** 封面（带尺寸和 srcset）；没有封面或文件丢失时为 null。 */
async function coverImage(tutorial: PublishedTutorial) {
  const info = tutorial.cover ? await uploadedImage(tutorial.cover) : null;
  return info && tutorial.cover ? { url: tutorial.cover, ...info } : null;
}

/**
 * 分享卡片和结构化数据用的图：有封面用封面，否则用自动生成的「标题 + 分类」分享图
 * （/og/tutorials/<id>，见 lib/share-image-render.tsx），比正文里随手截的图更适合做卡片。
 */
async function shareImage(tutorial: PublishedTutorial) {
  const cover = await coverImage(tutorial);
  if (cover) return { url: cover.url, width: cover.width, height: cover.height, alt: tutorial.title };
  const [{ siteName, logoText, brand }, { m }] = await Promise.all([getReaderSettings(), getReaderI18n()]);
  return {
    url: shareImagePath(tutorial.id, {
      title: tutorial.title,
      categoryName: tutorial.category.name,
      categoryColor: tutorial.category.color,
      siteName,
      logoText,
      accent: brand.accentColor || undefined,
      cta: m.site.share.articleCta,
    }),
    ...SHARE_IMAGE_SIZE,
    alt: tutorial.title,
  };
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug: rawSlug } = await params;
  const slug = decodeSegment(rawSlug);
  const t = slug ? await getPublishedTutorial(slug) : null;
  // 在 metadata 阶段就触发 404：此时响应尚未开始流式传输，
  // 才能返回真实的 404 状态码（否则 loading.tsx 先行输出 200）。
  if (!t) notFound();
  // 与页面渲染共用同一份处理结果（processArticle 按内容哈希缓存）。
  const { m } = await getReaderI18n();
  const { html } = await processArticle(t.content, m.site.articleHtml);
  return pageMetadata({
    title: t.title,
    description: describe(t, html),
    path: tutorialPath(t.slug),
    image: await shareImage(t),
    article: {
      publishedTime: t.createdAt,
      modifiedTime: t.updatedAt,
      section: t.category.name,
      tags: t.tags.map(({ tag }) => tag.name),
    },
  });
}

export default async function TutorialDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug: rawSlug } = await params;
  const slug = decodeSegment(rawSlug);

  const tutorial = slug ? await getPublishedTutorial(slug) : null;
  if (!tutorial) notFound();
  const { m, f, plural, date, locale } = await getReaderI18n();

  // 上一篇 / 下一篇：属于系列时按系列顺序，否则同分类内按时间
  const [categoryPrev, categoryNext, processed, settings, relatedCandidates, image, allSeries] = await Promise.all([
    prisma.tutorial.findFirst({
      where: {
        published: true,
        categoryId: tutorial.categoryId,
        createdAt: { lt: tutorial.createdAt },
      },
      orderBy: { createdAt: "desc" },
      select: { id: true, title: true, slug: true },
    }),
    prisma.tutorial.findFirst({
      where: {
        published: true,
        categoryId: tutorial.categoryId,
        createdAt: { gt: tutorial.createdAt },
      },
      orderBy: { createdAt: "asc" },
      select: { id: true, title: true, slug: true },
    }),
    processArticle(tutorial.content, m.site.articleHtml),
    getReaderSettings(),
    getRelatedTutorialCandidates(tutorial.id, tutorial.categoryId),
    shareImage(tutorial),
    tutorial.seriesId ? getPublishedSeries() : Promise.resolve([]),
  ]);
  const [subscribeEnabled, turnstileSiteKey] = await Promise.all([getSubscriptionEnabled(), getTurnstileSiteKey()]);
  const t = m.site.article;
  const formatDate = (value: Date) => date(value, LONG_DATE);
  const cover = await coverImage(tutorial);
  const series = allSeries.find((item) => item.id === tutorial.seriesId) ?? null;
  const position = series ? seriesPosition(series.tutorials, tutorial.id) : null;
  const prev = position ? position.prev : categoryPrev;
  const next = position ? position.next : categoryNext;
  const neighborNote = position ? t.fromSeries : "";

  // 上一篇/下一篇已经有入口，相关教程里不再重复出现。
  const related = relatedCandidates
    .filter((item) => item.id !== prev?.id && item.id !== next?.id)
    .slice(0, RELATED_TUTORIAL_LIMIT);

  const { html, toc } = processed;
  const articleUrl = absoluteUrl(tutorialPath(tutorial.slug));
  const site = { "@type": "Organization", name: settings.siteName, url: absoluteUrl("/") };
  const byline = bylineOf(tutorial.author);
  const jsonLd = {
    "@graph": [
      {
        "@type": "Article",
        "@id": `${articleUrl}#article`,
        headline: tutorial.title,
        description: describe(tutorial, html),
        url: articleUrl,
        mainEntityOfPage: articleUrl,
        image: [toAbsolute(assetUrl(image.url, settings.assetHost))],
        datePublished: tutorial.createdAt.toISOString(),
        dateModified: tutorial.updatedAt.toISOString(),
        articleSection: tutorial.category.name,
        ...(series && position
          ? {
              isPartOf: { "@type": "CreativeWorkSeries", name: series.title, url: absoluteUrl(seriesPath(series.slug)) },
              position: position.number,
            }
          : {}),
        ...(tutorial.tags.length ? { keywords: tutorial.tags.map(({ tag }) => tag.name).join(",") } : {}),
        inLanguage: locale,
        // 有署名时作者是这个人，否则还是站点本身
        author: byline ? { "@type": "Person", name: byline } : site,
        publisher: site,
      },
      breadcrumbJsonLd([
        { name: m.site.nav.home, path: "/" },
        {
          name: tutorial.category.name,
          path: `/categories/${encodeURIComponent(tutorial.category.slug)}`,
        },
        { name: tutorial.title },
      ]),
    ],
  };
  // 修改日期与发布日期不是同一天时才显示「更新于」（阅读量计数不会改动 updatedAt）。
  const updated = formatDate(tutorial.updatedAt) !== formatDate(tutorial.createdAt);
  const words = tutorial.content.replace(/<[^>]+>/g, "").length;
  const minutes = Math.max(1, Math.round(words / READING_CHARS_PER_MINUTE[locale]));

  return (
    <div className="mx-auto max-w-6xl px-4 pt-12" data-motion={settings.articleMotion}>
      <JsonLd data={jsonLd} />
      <ViewBeacon id={tutorial.id} />
      <ArticleEnhancer attribution={settings.antiScrape.copyAttribution ? { title: tutorial.title, url: articleUrl } : null} />
      <ReadingProgress tutorialId={tutorial.id} />
      {/* 面包屑 */}
      <Reveal>
        <nav className="print-hide flex items-center gap-2 text-sm text-ink-3">
          <IntentLink href="/" className="transition-colors hover:text-accent">{m.site.nav.home}</IntentLink>
          <span>/</span>
          <IntentLink
            href={getCategoryHref(tutorial.category)}
            {...categoryLinkTarget(getCategoryHref(tutorial.category))}
            className="transition-colors hover:text-accent"
          >
            {tutorial.category.name}
          </IntentLink>
          <span>/</span>
          <span className="truncate text-ink-2">{tutorial.title}</span>
        </nav>
      </Reveal>

      <div className="article-grid mt-8 grid grid-cols-1 gap-10 lg:grid-cols-[minmax(0,1fr)_230px] xl:grid-cols-[minmax(0,1fr)_260px]">
        <div>
          {/* 头部 */}
          <Reveal fade={false}>
            <header>
              <span
                className="cat-text inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium"
                style={{
                  backgroundColor: `${tutorial.category.color}14`,
                  ...categoryTextStyle(tutorial.category.color),
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
              <div className="border-b border-line pb-6">
                <div className="mt-4 flex flex-wrap items-center gap-4 text-xs text-ink-3">
                  {byline && (
                    <span>
                      {t.author} <span className="font-medium text-ink-2">{byline}</span>
                    </span>
                  )}
                  <span>
                    {t.published}{" "}
                    <time dateTime={tutorial.createdAt.toISOString()}>{formatDate(tutorial.createdAt)}</time>
                  </span>
                  {updated && (
                    <span>
                      {t.updated}{" "}
                      <time dateTime={tutorial.updatedAt.toISOString()}>{formatDate(tutorial.updatedAt)}</time>
                    </span>
                  )}
                  <span>{plural(minutes, t.readingTime)}</span>
                  <span>{plural(tutorial.views, m.site.views)}</span>
                </div>
                <TagChips
                  label={t.tags}
                  className="mt-4"
                  tags={tutorial.tags.map(({ tag }) => tag)}
                />
              </div>
            </header>
          </Reveal>

          {/* 封面头图：首屏主图，提高下载优先级 */}
          {cover && (
            // eslint-disable-next-line @next/next/no-img-element -- 上传目录的静态文件，自带响应式小图
            <img
              src={assetUrl(cover.url, settings.assetHost)}
              srcSet={assetSrcSet(cover.srcSet, settings.assetHost)}
              sizes="(min-width: 1280px) 820px, (min-width: 1024px) calc(100vw - 302px), calc(100vw - 32px)"
              width={cover.width}
              height={cover.height}
              alt={tutorial.title}
              fetchPriority="high"
              decoding="async"
              className="article-cover mt-8 aspect-video w-full rounded-2xl border border-line bg-paper object-cover"
            />
          )}

          {/* 「教程书」目录：手机和平板在正文上方，桌面在右侧栏 */}
          {series && (
            <SeriesBook variant="inline" title={series.title} slug={series.slug} tutorials={series.tutorials} currentId={tutorial.id} m={m} />
          )}

          {/* 移动端本页目录（可自行开关） */}
          <MobileToc items={toc} />

          {/* 正文 */}
          <Reveal delay={0.1} fade={false}>
            <article
              className="article-body mt-8"
              dangerouslySetInnerHTML={{ __html: rewriteAssetHtml(html, settings.assetHost) }}
            />
          </Reveal>

          <HelpfulFeedback id={tutorial.id} turnstileSiteKey={turnstileSiteKey} />
          <ShareButtons url={articleUrl} title={tutorial.title} />
          <SupportBox support={settings.support} assetHost={settings.assetHost} m={m} />
          {subscribeEnabled && (
            <section aria-labelledby="subscribe-heading" className="subscribe-box print-hide mt-8 rounded-2xl border border-line bg-surface p-5 sm:p-6">
              <h2 id="subscribe-heading" className="text-base font-semibold text-ink">{t.subscribeTitle}</h2>
              <p className="mt-1 text-sm text-ink-2">{t.subscribeIntro}</p>
              <SubscribeForm className="mt-4" turnstileSiteKey={turnstileSiteKey} />
            </section>
          )}

          {/* 上一篇 / 下一篇 */}
          <Reveal mode="scroll">
            <nav className="print-hide mt-14 grid grid-cols-1 gap-3 sm:grid-cols-2">
              {prev ? (
                <IntentLink href={`/tutorials/${prev.slug}`} className="block h-full">
                  <GlowCard className="group h-full p-5">
                    <span className="text-xs text-ink-3">{f(t.prev, { note: neighborNote })}</span>
                    <p className="mt-1.5 truncate text-sm font-semibold text-ink transition-colors group-hover:text-accent">
                      {prev.title}
                    </p>
                  </GlowCard>
                </IntentLink>
              ) : (
                <span />
              )}
              {next && (
                <IntentLink href={`/tutorials/${next.slug}`} className="block h-full">
                  <GlowCard className="group h-full p-5 text-right">
                    <span className="text-xs text-ink-3">{f(t.next, { note: neighborNote })}</span>
                    <p className="mt-1.5 truncate text-sm font-semibold text-ink transition-colors group-hover:text-accent">
                      {next.title}
                    </p>
                  </GlowCard>
                </IntentLink>
              )}
            </nav>
          </Reveal>

          {/* 第三方评论（站点设置里开启；演示站不显示） */}
          {settings.comments.provider !== "none" && !isDemoMode() && <Comments slug={tutorial.slug} />}

          {/* 相关教程：给读者下一步，也让爬虫更快发现同主题文章 */}
          {related.length > 0 && (
            <section aria-labelledby="related-heading" className="print-hide mt-14">
              <Reveal mode="scroll">
                <h2 id="related-heading" className="text-lg font-bold text-ink">
                  {t.related}
                </h2>
              </Reveal>
              <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
                {related.map((item, index) => (
                  <Reveal key={item.id} mode="scroll" delay={Math.min(index, 3) * 0.05}>
                    <TutorialCard
                      title={item.title}
                      slug={item.slug}
                      excerpt={item.excerpt}
                      categoryName={item.category.name}
                      categoryColor={item.category.color}
                      views={item.views}
                      createdAt={item.createdAt}
                      thumbnail={item.thumbnail}
                    />
                  </Reveal>
                ))}
              </div>
            </section>
          )}
        </div>

        {/* 右侧栏：系列的「教程书」目录 + 本页目录，一起吸顶 */}
        {(series || toc.length > 0) && (
          <aside className="print-hide relative hidden min-w-0 self-stretch lg:block">
            <div className="sticky top-24 max-h-[calc(100vh-7rem)] space-y-8 overflow-y-auto overscroll-contain pb-6">
              {series && (
                <SeriesBook variant="sidebar" title={series.title} slug={series.slug} tutorials={series.tutorials} currentId={tutorial.id} m={m} />
              )}
              <Toc items={toc} />
            </div>
          </aside>
        )}
      </div>
    </div>
  );
}
