import type { Metadata } from "next";
import { connection } from "next/server";
import RootDocument from "@/components/root-document";
import { I18nProvider } from "@/lib/i18n/client";
import { getAdminI18n } from "@/lib/i18n/server";
import { ROOT_VIEWPORT, siteIconsMetadata } from "@/lib/root-metadata";
import { getSettings } from "@/lib/settings";
import { SITE_URL } from "@/lib/site-url";

/*
 * 后台的根布局（前台是 app/[lang]/layout.tsx）。<html lang> 是管理员自己选的后台语言。
 */

export async function generateMetadata(): Promise<Metadata> {
  const [{ m }, settings] = await Promise.all([getAdminI18n(), getSettings()]);
  return {
    metadataBase: new URL(SITE_URL),
    title: {
      default: m.admin.layout.title,
      template: `%s · ${m.admin.layout.title}`,
    },
    icons: siteIconsMetadata(settings),
    robots: {
      index: false,
      follow: false,
    },
  };
}

export const viewport = ROOT_VIEWPORT;

export default async function AdminLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // 后台页面一律按请求渲染：严格 CSP 的 nonce 每个请求不同（proxy.ts），静态生成的页面拿不到 nonce，脚本会被拦下
  await connection();
  // 后台语言：管理员自己选的（Cookie），没选时跟网站语言（lib/i18n/server.ts）。
  // 首次安装页还没设过网站语言，自己再套一层按浏览器语言的 I18nProvider（app/admin/setup/page.tsx）
  const [{ locale, m }, { brand }] = await Promise.all([getAdminI18n(), getSettings()]);
  return (
    <RootDocument locale={locale} brand={brand}>
      <I18nProvider locale={locale} messages={{ common: m.common, reader: m.reader, admin: m.admin }}>
        <main className="flex min-h-screen flex-col [min-height:100dvh]">{children}</main>
      </I18nProvider>
    </RootDocument>
  );
}
