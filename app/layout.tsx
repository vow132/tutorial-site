import type { Metadata, Viewport } from "next";
import "./globals.css";
import { getSettings } from "@/lib/settings";
import { SITE_URL } from "@/lib/site-url";
import { RSS_FEED, defaultShareImage } from "@/lib/seo";
import { brandCss } from "@/lib/brand";
import { brandIconPath, siteIconVersion } from "@/lib/brand-icon";
import { verificationMetadata } from "@/lib/search-verification";
import ThemeBoot from "@/components/theme-boot";
import { THEME_SCRIPT } from "@/lib/theme-script.mjs";

/**
 * 全站兜底 metadata。注意这里**不能**写 canonical：没覆盖它的页面（搜索、404）
 * 会全部被规范到首页。可收录页面用 lib/seo.ts 的 pageMetadata() 生成完整字段。
 */
export async function generateMetadata(): Promise<Metadata> {
  const settings = await getSettings();
  const shareImage = await defaultShareImage(settings);
  // 网站图标：后台上传的图标，或者按 Logo 文字和主题色生成的字母图标（lib/site-icon.ts），地址带版本号
  const iconVersion = siteIconVersion(settings);
  const icon = (size: number) => brandIconPath(size, iconVersion);
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
      locale: "zh_CN",
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
    icons: {
      icon: [
        { url: icon(32), sizes: "32x32", type: "image/png" },
        { url: icon(192), sizes: "192x192", type: "image/png" },
      ],
      apple: [{ url: icon(180), sizes: "180x180", type: "image/png" }],
    },
    alternates: { types: RSS_FEED },
    // 后台「站点设置 → 搜索引擎验证」里填写的站长平台验证码。
    verification: verificationMetadata(settings.verification),
  };
}

// 让 iPhone 刘海屏、全面屏 Android 和横屏设备使用真实视口宽度渲染。
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#f7f8fa",
};


export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const { brand } = await getSettings();
  // 站点设置里选的主题色：覆盖 globals.css 的默认靛蓝（lib/brand.ts 自动算好对比度足够的变体）
  const accentStyle = brandCss(brand.accentColor);
  return (
    <html
      lang="zh-CN"
      className="h-full antialiased"
      data-theme="light"
      data-mascot={brand.mascot ? undefined : "off"}
      suppressHydrationWarning
    >
      <head>
        {accentStyle && <style dangerouslySetInnerHTML={{ __html: accentStyle }} />}
        {/*
          首屏前执行：确定亮/暗主题（规则见上面 themeScript 的说明）；省流量模式、内存 < 4GB、CPU < 4 核或系统要求减少透明效果时
          标记 data-lite，CSS 据此关掉毛玻璃、装饰光晕和循环动画（globals.css「精简模式」）。
        */}
        <script id="theme-script" dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body className="min-h-full">
        <ThemeBoot />
        {children}
      </body>
    </html>
  );
}
