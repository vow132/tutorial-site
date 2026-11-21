import type { Metadata } from "next";
import { notFound } from "next/navigation";
import IntentLink from "@/components/intent-link";
import JsonLd from "@/components/json-ld";
import Reveal from "@/components/reveal";
import { categoryTextStyle } from "@/lib/color";
import { getPublishedSeries } from "@/lib/public-data";
import { breadcrumbJsonLd, pageMetadata } from "@/lib/seo";
import { MIN_INDEXABLE_SERIES_TUTORIALS, seriesPath } from "@/lib/series";
import { getSettings } from "@/lib/settings";
import { absoluteUrl } from "@/lib/site-url";
import { decodeSegment } from "@/lib/url";

/** 和文章页一样是 ISR 缓存页：数据来自带缓存标签的 getPublishedSeries()，后台改动时随标签失效。 */
export const revalidate = 300;

export async function generateStaticParams() {
  return [];
}

/** 只认有已发布教程的系列；其余（不存在、全是草稿）都是 404。 */
async function findSeries(rawSlug: string) {
  const slug = decodeSegment(rawSlug);
  return slug ? (await getPublishedSeries()).find((series) => series.slug === slug) ?? null : null;
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const series = await findSeries(slug);
  if (!series) notFound();
  const settings = await getSettings();
  return pageMetadata({
    title: `${series.title}（系列教程）`,
    description: series.description || `${settings.siteName}的系列教程「${series.title}」，共 ${series.tutorials.length} 篇，按顺序阅读。`,
    path: seriesPath(series.slug),
    index: series.tutorials.length >= MIN_INDEXABLE_SERIES_TUTORIALS,
  });
}

export default async function SeriesPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const series = await findSeries(slug);
  if (!series) notFound();
  const url = absoluteUrl(seriesPath(series.slug));

  return (
    <div className="mx-auto max-w-3xl px-4 pt-14">
      <JsonLd
        data={{
          "@graph": [
            {
              "@type": "CreativeWorkSeries",
              "@id": `${url}#series`,
              name: series.title,
              url,
              ...(series.description ? { description: series.description } : {}),
              inLanguage: "zh-CN",
              hasPart: series.tutorials.map((t) => ({
                "@type": "Article",
                headline: t.title,
                url: absoluteUrl(`/tutorials/${encodeURIComponent(t.slug)}`),
              })),
            },
            breadcrumbJsonLd([{ name: "首页", path: "/" }, { name: "系列教程", path: "/series" }, { name: series.title }]),
          ],
        }}
      />
      <Reveal fade={false}>
        <nav className="mb-6 flex flex-wrap items-center gap-2 text-sm text-ink-3">
          <IntentLink href="/" className="transition-colors hover:text-accent">首页</IntentLink>
          <span>/</span>
          <IntentLink href="/series" className="transition-colors hover:text-accent">系列教程</IntentLink>
          <span>/</span>
          <span className="text-ink-2">{series.title}</span>
        </nav>
        <p className="text-xs font-medium text-accent-ink">系列教程 · 共 {series.tutorials.length} 篇</p>
        <h1 className="mt-2 text-3xl font-extrabold text-ink md:text-4xl">{series.title}</h1>
        {series.description && <p className="mt-3 text-base leading-relaxed text-ink-2">{series.description}</p>}
      </Reveal>

      <h2 className="sr-only">本系列教程（按阅读顺序）</h2>
      <ol className="mt-10 space-y-3">
        {series.tutorials.map((t, index) => (
          <li key={t.id}>
            <Reveal delay={Math.min(index, 5) * 0.05}>
              <IntentLink
                href={`/tutorials/${t.slug}`}
                className="group flex gap-4 rounded-2xl border border-line bg-surface p-5 transition-colors hover:border-accent/50"
              >
                <span
                  aria-hidden="true"
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent-soft text-sm font-bold text-accent-ink tabular-nums"
                >
                  {index + 1}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="sr-only">第 {index + 1} 篇：</span>
                  <span className="block font-semibold text-ink group-hover:text-accent-ink">{t.title}</span>
                  {t.excerpt && <span className="mt-1 line-clamp-2 block text-sm text-ink-2">{t.excerpt}</span>}
                  <span className="mt-2 flex flex-wrap items-center gap-3 text-xs text-ink-3">
                    <span className="cat-text" style={categoryTextStyle(t.category.color)}>
                      {t.category.name}
                    </span>
                    <span>{t.views} 次阅读</span>
                  </span>
                </span>
              </IntentLink>
            </Reveal>
          </li>
        ))}
      </ol>
    </div>
  );
}
