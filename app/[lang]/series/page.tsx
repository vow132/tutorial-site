import type { Metadata } from "next";
import IntentLink from "@/components/intent-link";
import JsonLd from "@/components/json-ld";
import Reveal from "@/components/reveal";
import { getPublishedSeries } from "@/lib/public-data";
import { breadcrumbJsonLd, pageMetadata } from "@/lib/seo";
import { seriesPath } from "@/lib/series";
import { getReaderI18n, getReaderSettings } from "@/lib/i18n/reader-server";

export async function generateMetadata(): Promise<Metadata> {
  const [series, settings, { m, plural }] = await Promise.all([getPublishedSeries(), getReaderSettings(), getReaderI18n()]);
  return pageMetadata({
    title: m.site.series.title,
    description: plural(series.length, m.site.series.description, { site: settings.siteName }),
    path: "/series",
    // 还没有系列时页面是空的，不让收录
    index: series.length > 0,
  });
}

export default async function SeriesIndexPage() {
  const [series, { m, f, plural }] = await Promise.all([getPublishedSeries(), getReaderI18n()]);
  const t = m.site.series;

  return (
    <div className="mx-auto max-w-6xl px-4 pt-14">
      <JsonLd data={breadcrumbJsonLd([{ name: m.site.nav.home, path: "/" }, { name: t.title }])} />
      <Reveal fade={false}>
        <h1 className="text-3xl font-extrabold text-ink md:text-4xl">{t.title}</h1>
        <p className="mt-3 text-sm text-ink-2">{t.intro}</p>
      </Reveal>

      {series.length === 0 ? (
        <div className="mt-16 rounded-3xl border border-dashed border-line bg-surface/60 py-20 text-center text-ink-3">
          {t.empty}
        </div>
      ) : (
        <ul className="mt-10 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {series.map((item, index) => (
            <li key={item.id}>
              <Reveal delay={Math.min(index, 5) * 0.05}>
                <IntentLink
                  href={seriesPath(item.slug)}
                  className="group flex h-full flex-col rounded-3xl border border-line bg-surface p-6 transition-colors hover:border-accent/50"
                >
                  <span className="text-xs font-medium text-accent-ink">{plural(item.tutorials.length, m.site.totalTutorials)}</span>
                  <span className="mt-2 text-lg font-bold text-ink group-hover:text-accent-ink">{item.title}</span>
                  {item.description && <span className="mt-2 line-clamp-3 text-sm text-ink-2">{item.description}</span>}
                  <span className="mt-4 text-xs text-ink-3">{f(t.startFromFirst, { title: item.tutorials[0]?.title ?? "" })}</span>
                </IntentLink>
              </Reveal>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
