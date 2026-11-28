import type { Metadata } from "next";
import { getReaderI18n } from "@/lib/i18n/reader-server";

export async function generateMetadata(): Promise<Metadata> {
  const { m } = await getReaderI18n();
  return { title: m.site.subscribe.unsubscribeTitle, robots: { index: false, follow: false } };
}

/** 退订：点按钮后删除订阅（邮箱客户端的「一键退订」直接请求 /api/unsubscribe，不经过这里）。 */
export default async function UnsubscribePage({ searchParams }: { searchParams: Promise<{ token?: string; status?: string }> }) {
  const { token, status } = await searchParams;
  const { m } = await getReaderI18n();
  const t = m.site.subscribe;
  return (
    <div className="mx-auto max-w-xl px-4 pt-16 text-center">
      {status === "ok" ? (
        <>
          <h1 className="text-2xl font-extrabold text-ink">{t.unsubscribed}</h1>
          <p className="mt-3 text-sm text-ink-2">{t.unsubscribedText}</p>
        </>
      ) : status === "invalid" || !token ? (
        <>
          <h1 className="text-2xl font-extrabold text-ink">{t.unsubscribeInvalid}</h1>
          <p className="mt-3 text-sm text-ink-2">{t.unsubscribeInvalidText}</p>
        </>
      ) : (
        <form method="post" action="/api/unsubscribe">
          <h1 className="text-2xl font-extrabold text-ink">{t.unsubscribeHeading}</h1>
          <p className="mt-3 text-sm text-ink-2">{t.unsubscribeText}</p>
          <input type="hidden" name="token" value={token} />
          <button type="submit" className="mt-6 h-11 rounded-full border border-line px-6 text-sm font-semibold text-ink transition-colors hover:bg-paper">
            {t.unsubscribeButton}
          </button>
        </form>
      )}
    </div>
  );
}
