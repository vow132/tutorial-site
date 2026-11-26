import type { Metadata } from "next";
import { connection } from "next/server";

export const metadata: Metadata = {
  title: {
    default: "管理后台",
    template: "%s · 管理后台",
  },
  robots: {
    index: false,
    follow: false,
  },
};

export default async function AdminLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // 后台页面一律按请求渲染：严格 CSP 的 nonce 每个请求不同（proxy.ts），静态生成的页面拿不到 nonce，脚本会被拦下
  await connection();
  return (
    <main className="flex min-h-screen flex-col [min-height:100dvh]">
      {children}
    </main>
  );
}
