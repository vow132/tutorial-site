import type { Metadata } from "next";
import SubscribeForm from "@/components/subscribe-form";
import { getSubscriptionEnabled } from "@/lib/mail";
import { getSettings } from "@/lib/settings";
import { getTurnstileSiteKey } from "@/lib/turnstile-store";
import { getSiteI18n } from "@/lib/i18n/server";
import { format } from "@/lib/i18n/format";

export async function generateMetadata(): Promise<Metadata> {
  const { m } = await getSiteI18n();
  return { title: m.site.subscribe.title, robots: { index: false, follow: true } };
}

export default async function SubscribePage() {
  const [enabled, settings, turnstileSiteKey, { m }] = await Promise.all([
    getSubscriptionEnabled(),
    getSettings(),
    getTurnstileSiteKey(),
    getSiteI18n(),
  ]);
  const t = m.site.subscribe;
  return (
    <div className="mx-auto max-w-xl px-4 pt-16">
      <h1 className="text-3xl font-extrabold text-ink">{t.title}</h1>
      {enabled ? (
        <>
          <p className="mt-3 text-sm leading-relaxed text-ink-2">
            {format(t.intro, { site: settings.siteName })}
          </p>
          <SubscribeForm className="mt-6" turnstileSiteKey={turnstileSiteKey} />
        </>
      ) : (
        <p className="mt-3 text-sm text-ink-2">
          {t.disabled}
          <a href="/feed.xml" className="text-accent-ink hover:underline">/feed.xml</a>
        </p>
      )}
    </div>
  );
}
