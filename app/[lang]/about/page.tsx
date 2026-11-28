import type { Metadata } from "next";
import { notFound } from "next/navigation";
import ArticleEnhancer from "@/components/article-enhancer";
import JsonLd from "@/components/json-ld";
import Reveal from "@/components/reveal";
import { getAbout, hasAboutContent } from "@/lib/about";
import { htmlToDescription, processArticle } from "@/lib/article";
import { breadcrumbJsonLd, pageMetadata } from "@/lib/seo";

import { absoluteUrl } from "@/lib/site-url";
import { rewriteAssetHtml } from "@/lib/asset-url";
import { getReaderI18n, getReaderSettings } from "@/lib/i18n/reader-server";

/** 静态缓存页：后台保存时立即失效（lib/actions/about.ts），另有每小时一次的兜底刷新。 */
export const revalidate = 3600;

export async function generateMetadata(): Promise<Metadata> {
  const { m } = await getReaderI18n();
  const [about, settings] = await Promise.all([getAbout(m.defaults.aboutTitle), getReaderSettings()]);
  if (!hasAboutContent(about)) notFound();
  const { html } = await processArticle(about.content, m.site.articleHtml);
  return pageMetadata({
    title: about.title,
    description: htmlToDescription(html) || settings.siteDescription,
    path: "/about",
  });
}

export default async function AboutPage() {
  const { m } = await getReaderI18n();
  const [about, settings] = await Promise.all([getAbout(m.defaults.aboutTitle), getReaderSettings()]);
  if (!hasAboutContent(about)) notFound();
  const { html } = await processArticle(about.content, m.site.articleHtml);
  const site = { "@type": "Organization", name: settings.siteName, url: absoluteUrl("/") };

  return (
    <div className="mx-auto max-w-3xl px-4 pt-14">
      <JsonLd
        data={{
          "@graph": [
            {
              "@type": "AboutPage",
              name: about.title,
              url: absoluteUrl("/about"),
              description: htmlToDescription(html) || settings.siteDescription,
              inLanguage: settings.locale,
              about: site,
              ...(about.updatedAt ? { dateModified: about.updatedAt } : {}),
            },
            breadcrumbJsonLd([{ name: m.site.nav.home, path: "/" }, { name: about.title }]),
          ],
        }}
      />
      <ArticleEnhancer />
      <Reveal fade={false}>
        <h1 className="text-3xl font-extrabold leading-tight text-ink md:text-4xl">{about.title}</h1>
      </Reveal>
      <Reveal delay={0.08} fade={false}>
        <article className="article-body mt-8" dangerouslySetInnerHTML={{ __html: rewriteAssetHtml(html, settings.assetHost) }} />
      </Reveal>
    </div>
  );
}
