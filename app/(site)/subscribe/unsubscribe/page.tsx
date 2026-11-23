import type { Metadata } from "next";

export const metadata: Metadata = { title: "退订", robots: { index: false, follow: false } };

/** 退订：点按钮后删除订阅（邮箱客户端的「一键退订」直接请求 /api/unsubscribe，不经过这里）。 */
export default async function UnsubscribePage({ searchParams }: { searchParams: Promise<{ token?: string; status?: string }> }) {
  const { token, status } = await searchParams;
  return (
    <div className="mx-auto max-w-xl px-4 pt-16 text-center">
      {status === "ok" ? (
        <>
          <h1 className="text-2xl font-extrabold text-ink">已退订</h1>
          <p className="mt-3 text-sm text-ink-2">不会再收到新教程提醒，你的邮箱也已经从订阅列表里删除。</p>
        </>
      ) : status === "invalid" || !token ? (
        <>
          <h1 className="text-2xl font-extrabold text-ink">链接无效</h1>
          <p className="mt-3 text-sm text-ink-2">可能已经退订过了。</p>
        </>
      ) : (
        <form method="post" action="/api/unsubscribe">
          <h1 className="text-2xl font-extrabold text-ink">退订新教程提醒</h1>
          <p className="mt-3 text-sm text-ink-2">确认后不会再收到邮件。</p>
          <input type="hidden" name="token" value={token} />
          <button type="submit" className="mt-6 h-11 rounded-full border border-line px-6 text-sm font-semibold text-ink transition-colors hover:bg-paper">
            确认退订
          </button>
        </form>
      )}
    </div>
  );
}
