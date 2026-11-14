import type { Metadata } from "next";
import { getSettings } from "@/lib/settings";
import { SITE_URL, absoluteUrl } from "@/lib/site-url";

/** 没有配图时的默认分享图（public/og.png）。 */
export const DEFAULT_OG_IMAGE = { url: "/og.png", width: 1200, height: 630 } as const;

export const RSS_FEED = { "application/rss+xml": absoluteUrl("/feed.xml") };

export type SeoImage = { url: string; width?: number; height?: number; alt?: string };

/** 分页列表的规范地址：第 1 页不带 ?page，其余页各自独立收录。 */
export function withPage(path: string, page: number) {
  return page > 1 ? `${path}?page=${page}` : path;
}

export function pageSuffix(page: number) {
  return page > 1 ? ` · 第 ${page} 页` : "";
}

/** 站内资源路径转绝对地址；外站地址原样返回。 */
export function toAbsolute(url: string) {
  return new URL(url, `${SITE_URL}/`).toString();
}

/**
 * 生成一个可收录页面的完整 metadata。
 *
 * 各层 metadata 是**浅合并**：页面一旦写了 openGraph / alternates，根布局里的同名
 * 字段会被整个替换（包括 RSS 链接、站点名、默认分享图）。所以这里每次都给全：
 * 规范地址 + RSS、完整的 OpenGraph 与 Twitter 卡片。
 */
export async function pageMetadata({
  title,
  description,
  path,
  image,
  article,
}: {
  /** 省略时沿用根布局的站点标题（首页）。 */
  title?: string;
  description: string;
  /** 站内路径，已做 URL 编码，例如 `/tutorials/css-grid`。 */
  path: string;
  image?: SeoImage | null;
  article?: { publishedTime: Date; modifiedTime: Date; section?: string };
}): Promise<Metadata> {
  const settings = await getSettings();
  const shareTitle = title ?? settings.siteTitle;
  const shareImage: SeoImage = image ?? { ...DEFAULT_OG_IMAGE, alt: settings.siteTitle };

  const common = {
    siteName: settings.siteName,
    locale: "zh_CN",
    url: path,
    title: shareTitle,
    description,
    images: [shareImage],
  };

  return {
    ...(title ? { title } : {}),
    description,
    alternates: { canonical: path, types: RSS_FEED },
    openGraph: article
      ? {
          ...common,
          type: "article",
          publishedTime: article.publishedTime.toISOString(),
          modifiedTime: article.modifiedTime.toISOString(),
          section: article.section,
        }
      : { ...common, type: "website" },
    twitter: {
      card: "summary_large_image",
      title: shareTitle,
      description,
      images: [{ url: shareImage.url, alt: shareImage.alt }],
    },
  };
}

/** schema.org 面包屑；最后一项（当前页）可以不带链接。 */
export function breadcrumbJsonLd(items: { name: string; path?: string }[]) {
  return {
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: item.name,
      ...(item.path ? { item: absoluteUrl(item.path) } : {}),
    })),
  };
}
