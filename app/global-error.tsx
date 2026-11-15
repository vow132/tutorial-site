"use client";

import "./globals.css";

/**
 * 根布局本身出错时的兜底页（替换整个根布局，所以要自带 html/body 和样式）。
 * 不显示错误详情，只给出错误编号方便对照服务端日志。
 */
export default function GlobalError({
  error,
  retry,
}: {
  error: unknown;
  retry: () => void;
}) {
  const digest = error instanceof Error ? (error as Error & { digest?: string }).digest : undefined;
  return (
    <html lang="zh-CN" data-theme="light">
      <body className="min-h-full bg-paper">
        <title>页面出错了</title>
        <main className="mx-auto flex min-h-screen max-w-lg flex-col items-center justify-center px-4 text-center">
          <h1 className="text-4xl font-extrabold text-ink">页面出错了</h1>
          <p className="mt-4 text-ink-2">网站暂时无法显示，请稍后重试；如果反复出现，请联系站长。</p>
          {digest && <p className="mt-2 text-xs text-ink-3">错误编号：{digest}</p>}
          <div className="mt-8">
            <button
              type="button"
              onClick={() => retry()}
              className="flex h-11 items-center rounded-full bg-btn px-6 text-sm font-semibold text-white"
            >
              重试
            </button>
          </div>
        </main>
      </body>
    </html>
  );
}
