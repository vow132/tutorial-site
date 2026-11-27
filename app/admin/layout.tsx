import type { Metadata } from "next";
import { connection } from "next/server";
import { I18nProvider } from "@/lib/i18n/client";
import { getAdminI18n } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const { m } = await getAdminI18n();
  return {
    title: {
      default: m.admin.layout.title,
      template: `%s · ${m.admin.layout.title}`,
    },
    robots: {
      index: false,
      follow: false,
    },
  };
}

export default async function AdminLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // 后台页面一律按请求渲染：严格 CSP 的 nonce 每个请求不同（proxy.ts），静态生成的页面拿不到 nonce，脚本会被拦下
  await connection();
  // 后台语言：管理员自己选的（Cookie），没选时跟网站语言（lib/i18n/server.ts）。
  // 首次安装页还没设过网站语言，自己再套一层按浏览器语言的 I18nProvider（app/admin/setup/page.tsx）
  const { locale, m } = await getAdminI18n();
  return (
    <I18nProvider locale={locale} messages={{ common: m.common, reader: m.reader, admin: m.admin }}>
      <main lang={locale} className="flex min-h-screen flex-col [min-height:100dvh]">
        {children}
      </main>
    </I18nProvider>
  );
}
