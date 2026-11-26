import type { Metadata } from "next";
import SubscribeForm from "@/components/subscribe-form";
import { getSubscriptionEnabled } from "@/lib/mail";
import { getSettings } from "@/lib/settings";
import { getTurnstileSiteKey } from "@/lib/turnstile-store";

export const metadata: Metadata = { title: "邮件订阅", robots: { index: false, follow: true } };

export default async function SubscribePage() {
  const [enabled, settings, turnstileSiteKey] = await Promise.all([getSubscriptionEnabled(), getSettings(), getTurnstileSiteKey()]);
  return (
    <div className="mx-auto max-w-xl px-4 pt-16">
      <h1 className="text-3xl font-extrabold text-ink">邮件订阅</h1>
      {enabled ? (
        <>
          <p className="mt-3 text-sm leading-relaxed text-ink-2">
            「{settings.siteName}」有新教程时发一封邮件提醒你。不会发别的内容，每封邮件底部都能一键退订。
          </p>
          <SubscribeForm className="mt-6" turnstileSiteKey={turnstileSiteKey} />
        </>
      ) : (
        <p className="mt-3 text-sm text-ink-2">邮件订阅暂未开启。也可以用 RSS 订阅：<a href="/feed.xml" className="text-accent-ink hover:underline">/feed.xml</a></p>
      )}
    </div>
  );
}
