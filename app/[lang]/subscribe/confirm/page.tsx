import type { Metadata } from "next";
import IntentLink from "@/components/intent-link";

import { rich } from "@/lib/i18n/rich";
import { getReaderI18n } from "@/lib/i18n/reader-server";

export async function generateMetadata(): Promise<Metadata> {
  const { m } = await getReaderI18n();
  return { title: m.site.subscribe.confirmTitle, robots: { index: false, follow: false } };
}

/** 确认订阅：链接打开后还要点一下按钮（邮箱安全扫描自动打开链接时不会误确认）。 */
export default async function ConfirmPage({ searchParams }: { searchParams: Promise<{ token?: string; status?: string }> }) {
  const { token, status } = await searchParams;
  const { m } = await getReaderI18n();
  const t = m.site.subscribe;
  return (
    <div className="mx-auto max-w-xl px-4 pt-16 text-center">
      {status === "ok" ? (
        <>
          <h1 className="text-2xl font-extrabold text-ink">{t.confirmed}</h1>
          <p className="mt-3 text-sm text-ink-2">{t.confirmedText}</p>
        </>
      ) : status === "invalid" || !token ? (
        <>
          <h1 className="text-2xl font-extrabold text-ink">{t.confirmInvalid}</h1>
          <p className="mt-3 text-sm text-ink-2">
            {rich(t.confirmInvalidText, {
              link: (
                <IntentLink href="/subscribe" className="text-accent-ink hover:underline">
                  {t.confirmInvalidLink}
                </IntentLink>
              ),
            })}
          </p>
        </>
      ) : (
        <form method="post" action="/api/subscribe/confirm">
          <h1 className="text-2xl font-extrabold text-ink">{t.confirmHeading}</h1>
          <p className="mt-3 text-sm text-ink-2">{t.confirmText}</p>
          <input type="hidden" name="token" value={token} />
          <button type="submit" className="mt-6 h-11 rounded-full bg-btn px-6 text-sm font-semibold text-white transition-opacity hover:opacity-90">
            {t.confirmButton}
          </button>
        </form>
      )}
    </div>
  );
}
