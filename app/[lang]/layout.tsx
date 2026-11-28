import type { Metadata } from "next";
import RootDocument from "@/components/root-document";
import { I18nProvider } from "@/lib/i18n/client";
import { OG_LOCALE } from "@/lib/i18n/locales";
import { messagesFor } from "@/lib/i18n/messages";
import { READER_SEGMENTS } from "@/lib/i18n/reader";
import { getReaderLocale, getReaderSettings } from "@/lib/i18n/reader-server";
import { ROOT_VIEWPORT, siteIconsMetadata } from "@/lib/root-metadata";
import { verificationMetadata } from "@/lib/search-verification";
import { RSS_FEED, defaultShareImage } from "@/lib/seo";
import { getSettings } from "@/lib/settings";
import { SITE_URL } from "@/lib/site-url";
import SiteFrame from "./site-frame";

/*
 * 前台的根布局。[lang] 不出现在网址里：proxy.ts 按读者选的语言（Cookie）把 /x 改写到 /<段>/x，
 * 段是 default（网站语言）或某个语言代码（lib/i18n/reader.ts）。每个页面按段各缓存一份。
 */

// 5 份都预先列出来，页面照常是 ISR 缓存页（文章等动态路由仍是用到时再生成）
export function generateStaticParams() {
  return READER_SEGMENTS.map((lang) => ({ lang }));
}

/**
 * 全站兜底 metadata。注意这里**不能**写 canonical：没覆盖它的页面（搜索、404）
 * 会全部被规范到首页。可收录页面用 lib/seo.ts 的 pageMetadata() 生成完整字段。
 */
export async function generateMetadata(): Promise<Metadata> {
  const [settings, locale, siteSettings] = await Promise.all([getReaderSettings(), getReaderLocale(), getSettings()]);
  // 默认分享图按网站语言生成（/og/site 读的是站点设置），不跟读者语言
  const shareImage = await defaultShareImage(siteSettings);
  return {
    metadataBase: new URL(SITE_URL),
    title: {
      default: settings.siteTitle,
      template: `%s · ${settings.siteName}`,
    },
    description: settings.siteDescription,
    openGraph: {
      type: "website",
      siteName: settings.siteName,
      locale: OG_LOCALE[locale],
      title: settings.siteTitle,
      description: settings.siteDescription,
      images: [shareImage],
    },
    twitter: {
      card: "summary_large_image",
      title: settings.siteTitle,
      description: settings.siteDescription,
      images: [shareImage.url],
    },
    icons: siteIconsMetadata(settings),
    alternates: { types: RSS_FEED },
    // 后台「站点设置 → 搜索引擎验证」里填写的站长平台验证码。
    verification: verificationMetadata(settings.verification),
  };
}

export const viewport = ROOT_VIEWPORT;

export default async function SiteRootLayout({ children }: LayoutProps<"/[lang]">) {
  const [settings, locale] = await Promise.all([getReaderSettings(), getReaderLocale()]);
  const m = messagesFor(locale);
  return (
    <RootDocument locale={locale} brand={settings.brand}>
      {/* 前台浏览器端组件的文案：读者看到的语言 */}
      <I18nProvider locale={locale} messages={{ common: m.common, reader: m.reader }}>
        <SiteFrame siteLocale={settings.locale}>{children}</SiteFrame>
      </I18nProvider>
    </RootDocument>
  );
}
