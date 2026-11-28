import type { Metadata } from "next";
import { notFound } from "next/navigation";
import IntentLink from "@/components/intent-link";
import JsonLd from "@/components/json-ld";
import Reveal from "@/components/reveal";
import { categoryTextStyle } from "@/lib/color";
import { getPublishedSeries } from "@/lib/public-data";
import { breadcrumbJsonLd, pageMetadata } from "@/lib/seo";
import { groupByChapter, MIN_INDEXABLE_SERIES_TUTORIALS, seriesPath } from "@/lib/series";
import { ReadMark, SeriesProgress } from "@/components/reading-history";

import { absoluteUrl } from "@/lib/site-url";
import { decodeSegment } from "@/lib/url";
import { getReaderI18n, getReaderSettings } from "@/lib/i18n/reader-server";

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
  const [settings, { m, f, plural }] = await Promise.all([getReaderSettings(), getReaderI18n()]);
  return pageMetadata({
    title: f(m.site.series.pageTitle, { title: series.title }),
    description: series.description || plural(series.tutorials.length, m.site.series.pageDescription, { site: settings.siteName, title: series.title }),
    path: seriesPath(series.slug),
    index: series.tutorials.length >= MIN_INDEXABLE_SERIES_TUTORIALS,
  });
}

export default async function SeriesPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const series = await findSeries(slug);
  if (!series) notFound();
  const url = absoluteUrl(seriesPath(series.slug));
  const [{ m, f, plural }, { locale }] = await Promise.all([getReaderI18n(), getReaderSettings()]);
  const tx = m.site.series;
  const groups = groupByChapter(series.tutorials);
  // 只给有章节名的组编号：第 1 章、第 2 章…
  const chapterNumbers = new Map(groups.filter((group) => group.chapter).map((group, index) => [group, index + 1]));

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
              inLanguage: locale,
              hasPart: series.tutorials.map((t) => ({
                "@type": "Article",
                headline: t.title,
                url: absoluteUrl(`/tutorials/${encodeURIComponent(t.slug)}`),
              })),
            },
            breadcrumbJsonLd([{ name: m.site.nav.home, path: "/" }, { name: tx.title, path: "/series" }, { name: series.title }]),
          ],
        }}
      />
      <Reveal fade={false}>
        <nav className="mb-6 flex flex-wrap items-center gap-2 text-sm text-ink-3">
          <IntentLink href="/" className="transition-colors hover:text-accent">{m.site.nav.home}</IntentLink>
          <span>/</span>
          <IntentLink href="/series" className="transition-colors hover:text-accent">{tx.title}</IntentLink>
          <span>/</span>
          <span className="text-ink-2">{series.title}</span>
        </nav>
        <p className="text-xs font-medium text-accent-ink">{plural(series.tutorials.length, tx.label)}</p>
        <h1 className="mt-2 text-3xl font-extrabold text-ink md:text-4xl">{series.title}</h1>
        {series.description && <p className="mt-3 text-base leading-relaxed text-ink-2">{series.description}</p>}
      </Reveal>

      {/* 阅读进度和「继续阅读」：只记在本浏览器里（lib/reading-history.ts） */}
      <SeriesProgress tutorials={groups.flatMap((group) => group.items)} />

      <h2 className="sr-only">{tx.listHeading}</h2>
      <div className="mt-10 space-y-10">
        {groups.map((group, groupIndex) => (
          <section key={`${groupIndex}-${group.chapter ?? ""}`} aria-label={group.chapter ?? undefined}>
            {group.chapter && (
              <h3 className="mb-3 flex items-baseline gap-3 text-lg font-bold text-ink">
                <span className="text-sm font-semibold text-accent-ink tabular-nums">{f(tx.chapter, { n: chapterNumbers.get(group) ?? 0 })}</span>
                {group.chapter}
              </h3>
            )}
            <ol className="space-y-3">
              {group.items.map((t) => (
                <li key={t.id}>
                  <Reveal delay={Math.min(t.number - 1, 5) * 0.05}>
                    <IntentLink
                      href={`/tutorials/${t.slug}`}
                      className="group flex gap-4 rounded-2xl border border-line bg-surface p-5 transition-colors hover:border-accent/50"
                    >
                      <span
                        aria-hidden="true"
                        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent-soft text-sm font-bold text-accent-ink tabular-nums"
                      >
                        {t.number}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="sr-only">{f(tx.itemNumber, { n: t.number })}</span>
                        <span className="flex items-start gap-1.5">
                          <span className="font-semibold text-ink group-hover:text-accent-ink">{t.title}</span>
                          <ReadMark id={t.id} />
                        </span>
                        {t.excerpt && <span className="mt-1 line-clamp-2 block text-sm text-ink-2">{t.excerpt}</span>}
                        <span className="mt-2 flex flex-wrap items-center gap-3 text-xs text-ink-3">
                          <span className="cat-text" style={categoryTextStyle(t.category.color)}>
                            {t.category.name}
                          </span>
                          <span>{plural(t.views, m.site.views)}</span>
                        </span>
                      </span>
                    </IntentLink>
                  </Reveal>
                </li>
              ))}
            </ol>
          </section>
        ))}
      </div>
    </div>
  );
}
