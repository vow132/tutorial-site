import "@/app/globals.css";
import ThemeBoot from "@/components/theme-boot";
import { brandCss } from "@/lib/brand";
import type { Locale } from "@/lib/i18n/locales";
import type { BrandSettings } from "@/lib/settings-extras";
import { THEME_SCRIPT } from "@/lib/theme-script.mjs";

/**
 * 前台（app/[lang]/layout.tsx）和后台（app/admin/layout.tsx）两个根布局共用的 <html> 外壳。
 * 前台的语言是读者看到的语言，后台是管理员自己选的语言，所以分成两个根布局，<html lang> 各自正确。
 * 两边切换会整页刷新（Next 跨根布局导航的规则），前后台之间本来就是整页跳转。
 */
export default function RootDocument({
  locale,
  brand,
  children,
}: {
  locale: Locale;
  brand: BrandSettings;
  children: React.ReactNode;
}) {
  // 站点设置里选的主题色：覆盖 globals.css 的默认靛蓝（lib/brand.ts 自动算好对比度足够的变体）
  const accentStyle = brandCss(brand.accentColor);
  return (
    <html
      lang={locale}
      className="h-full antialiased"
      data-theme="light"
      data-mascot={brand.mascot ? undefined : "off"}
      suppressHydrationWarning
    >
      {/* 两个根布局共用的 <html> 外壳，<head> 写在这里和写在 layout.tsx 里一样（App Router 不用 next/head） */}
      {/* eslint-disable-next-line @next/next/no-head-element */}
      <head>
        {accentStyle && <style dangerouslySetInnerHTML={{ __html: accentStyle }} />}
        {/*
          首屏前执行：确定亮/暗主题；省流量模式、内存 < 4GB、CPU < 4 核或系统要求减少透明效果时
          标记 data-lite，CSS 据此关掉毛玻璃、装饰光晕和循环动画（globals.css「精简模式」）。
          后台的 CSP 按这段固定内容的 SHA-256 放行，不要在里面拼接设置值（lib/theme-script.mjs）。
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
