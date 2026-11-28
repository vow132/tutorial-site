import type { Metadata } from "next";
import IntentLink from "@/components/intent-link";
import JsonLd from "@/components/json-ld";
import Reveal from "@/components/reveal";
import { getPublishedTags } from "@/lib/public-data";
import { breadcrumbJsonLd, pageMetadata } from "@/lib/seo";

import { tagPath } from "@/lib/tags";
import { getReaderI18n, getReaderSettings } from "@/lib/i18n/reader-server";

export async function generateMetadata(): Promise<Metadata> {
  const [tags, settings, { m, plural }] = await Promise.all([getPublishedTags(), getReaderSettings(), getReaderI18n()]);
  return pageMetadata({
    title: m.site.tags.title,
    description: plural(tags.length, m.site.tags.description, { site: settings.siteName }),
    path: "/tags",
  });
}

/** 标签云：字号随篇数分四档，篇数越多越醒目。 */
function sizeClass(count: number, max: number) {
  const ratio = max > 1 ? (count - 1) / (max - 1) : 0;
  if (ratio > 0.75) return "text-lg";
  if (ratio > 0.4) return "text-base";
  if (ratio > 0.15) return "text-sm";
  return "text-xs";
}

export default async function TagsPage() {
  const [tags, { m, plural }] = await Promise.all([getPublishedTags(), getReaderI18n()]);
  const t = m.site.tags;
  const max = Math.max(1, ...tags.map((tag) => tag.count));

  return (
    <div className="mx-auto max-w-6xl px-4 pt-14">
      <JsonLd data={breadcrumbJsonLd([{ name: m.site.nav.home, path: "/" }, { name: t.title }])} />
      <Reveal fade={false}>
        <h1 className="text-3xl font-extrabold text-ink md:text-4xl">{t.title}</h1>
        <p className="mt-3 text-sm text-ink-2">{plural(tags.length, t.intro)}</p>
      </Reveal>

      {tags.length === 0 ? (
        <div className="mt-16 rounded-3xl border border-dashed border-line bg-surface/60 py-20 text-center text-ink-3">
          {t.empty}
        </div>
      ) : (
        <Reveal>
          <ul className="mt-10 flex flex-wrap gap-3 rounded-3xl border border-line bg-surface p-6 sm:p-8">
            {tags.map((tag) => (
              <li key={tag.slug}>
                <IntentLink
                  href={tagPath(tag.slug)}
                  className={`inline-flex items-baseline gap-1.5 rounded-full border border-line bg-paper px-4 py-1.5 font-medium text-ink transition-colors hover:border-accent hover:text-accent-ink ${sizeClass(tag.count, max)}`}
                >
                  #{tag.name}
                  <span className="text-xs font-normal text-ink-3">{tag.count}</span>
                </IntentLink>
              </li>
            ))}
          </ul>
        </Reveal>
      )}
    </div>
  );
}
