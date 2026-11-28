import type { Metadata } from "next";
import { getSettings, type SiteSettings } from "@/lib/settings";
import { SITE_URL, absoluteUrl } from "@/lib/site-url";
import { SHARE_IMAGE_SIZE, siteShareCard, siteShareImagePath } from "@/lib/share-image";
import { uploadedImage } from "@/lib/article";
import { assetUrl } from "@/lib/asset-url";
import { OG_LOCALE } from "@/lib/i18n/locales";
import { messagesFor } from "@/lib/i18n/messages";
import { format } from "@/lib/i18n/format";
import { getReaderLocale, getReaderSettings } from "@/lib/i18n/reader-server";

/**
 * 没有配图的页面用的默认分享图：后台「站点设置 → 品牌」上传了就用上传的，
 * 否则用按站名、首页大标题和主题色自动生成的 /og/site 图（设置一改地址就变）。
 */
export async function defaultShareImage(settings: SiteSettings): Promise<SeoImage> {
  const uploaded = settings.brand.shareImage ? await uploadedImage(settings.brand.shareImage) : null;
  if (uploaded) {
    return { url: assetUrl(settings.brand.shareImage, settings.assetHost), width: uploaded.width, height: uploaded.height, alt: settings.siteTitle };
  }
  const cta = messagesFor(settings.locale).site.share.siteCta;
  return { url: siteShareImagePath(siteShareCard(settings, cta)), ...SHARE_IMAGE_SIZE, alt: settings.siteTitle };
}

export const RSS_FEED = { "application/rss+xml": absoluteUrl("/feed.xml") };

export type SeoImage = { url: string; width?: number; height?: number; alt?: string };

/** 分页列表的规范地址：第 1 页不带 ?page，其余页各自独立收录。 */
export function withPage(path: string, page: number) {
  return page > 1 ? `${path}?page=${page}` : path;
}

/** 分页标题的后缀，template 取自字典的 site.pageSuffix（「 · 第 {page} 页」） */
export function pageSuffix(page: number, template: string) {
  return page > 1 ? format(template, { page }) : "";
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
  index = true,
}: {
  /** 省略时沿用根布局的站点标题（首页）。 */
  title?: string;
  description: string;
  /** 站内路径，已做 URL 编码，例如 `/tutorials/css-grid`。 */
  path: string;
  image?: SeoImage | null;
  article?: { publishedTime: Date; modifiedTime: Date; section?: string; tags?: string[] };
  /** 不希望被收录时（如只有一篇教程的标签页）设为 false，仍允许爬虫顺着链接走。 */
  index?: boolean;
}): Promise<Metadata> {
  // 读者看到的站名等（站长没改过的默认文字跟读者语言走）；默认分享图按网站语言生成（/og/site 用的是站点设置）
  const [settings, siteSettings, readerLocale] = await Promise.all([getReaderSettings(), getSettings(), getReaderLocale()]);
  const shareTitle = title ?? settings.siteTitle;
  // 本站上传的图片（封面）走图片加速地址（lib/asset-url.ts）
  const shareImage: SeoImage = image ? { ...image, url: assetUrl(image.url, settings.assetHost) } : await defaultShareImage(siteSettings);

  const common = {
    siteName: settings.siteName,
    locale: OG_LOCALE[readerLocale],
    url: path,
    title: shareTitle,
    description,
    images: [shareImage],
  };

  return {
    ...(title ? { title } : {}),
    description,
    ...(index ? {} : { robots: { index: false, follow: true } }),
    alternates: { canonical: path, types: RSS_FEED },
    openGraph: article
      ? {
          ...common,
          type: "article",
          publishedTime: article.publishedTime.toISOString(),
          modifiedTime: article.modifiedTime.toISOString(),
          section: article.section,
          ...(article.tags?.length ? { tags: article.tags } : {}),
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
