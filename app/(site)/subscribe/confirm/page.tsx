import type { Metadata } from "next";
import IntentLink from "@/components/intent-link";

export const metadata: Metadata = { title: "确认订阅", robots: { index: false, follow: false } };

/** 确认订阅：链接打开后还要点一下按钮（邮箱安全扫描自动打开链接时不会误确认）。 */
export default async function ConfirmPage({ searchParams }: { searchParams: Promise<{ token?: string; status?: string }> }) {
  const { token, status } = await searchParams;
  return (
    <div className="mx-auto max-w-xl px-4 pt-16 text-center">
      {status === "ok" ? (
        <>
          <h1 className="text-2xl font-extrabold text-ink">订阅成功</h1>
          <p className="mt-3 text-sm text-ink-2">有新教程时会发邮件提醒你，每封邮件底部都能一键退订。</p>
        </>
      ) : status === "invalid" || !token ? (
        <>
          <h1 className="text-2xl font-extrabold text-ink">链接无效或已过期</h1>
          <p className="mt-3 text-sm text-ink-2">
            确认链接 7 天内有效。可以<IntentLink href="/subscribe" className="text-accent-ink hover:underline">重新订阅</IntentLink>。
          </p>
        </>
      ) : (
        <form method="post" action="/api/subscribe/confirm">
          <h1 className="text-2xl font-extrabold text-ink">确认订阅新教程提醒</h1>
          <p className="mt-3 text-sm text-ink-2">点下面的按钮完成订阅。</p>
          <input type="hidden" name="token" value={token} />
          <button type="submit" className="mt-6 h-11 rounded-full bg-btn px-6 text-sm font-semibold text-white transition-opacity hover:opacity-90">
            确认订阅
          </button>
        </form>
      )}
    </div>
  );
}
