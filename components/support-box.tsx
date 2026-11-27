import type { SupportSettings } from "@/lib/settings-extras";
import { assetUrl } from "@/lib/asset-url";
import type { Messages } from "@/lib/i18n/messages";
import { format } from "@/lib/i18n/format";

/**
 * 文末的打赏与赞助（站点设置 →「赞助与打赏」）。都没设置时什么也不渲染。
 * 打赏用原生 <details> 展开收款码，不需要脚本；赞助链接带 rel="sponsored"。
 */
export default function SupportBox({ support, assetHost, m }: { support: SupportSettings; assetHost: string; m: Messages }) {
  const t = m.site.support;
  const codes = [
    { src: assetUrl(support.wechatQr, assetHost), label: t.wechat },
    { src: assetUrl(support.alipayQr, assetHost), label: t.alipay },
  ].filter((code) => code.src);
  const sponsor = support.sponsorText;
  if (codes.length === 0 && !sponsor) return null;

  const sponsorContent = (
    <>
      {support.sponsorImage && (
        // eslint-disable-next-line @next/next/no-img-element -- 后台上传的静态图片
        <img src={assetUrl(support.sponsorImage, assetHost)} alt="" loading="lazy" decoding="async" className="max-h-12 w-auto rounded-md" />
      )}
      <span>{sponsor}</span>
    </>
  );

  return (
    <aside aria-label={t.ariaLabel} className="support-box print-hide mt-6 flex flex-col items-center gap-4 text-center">
      {codes.length > 0 && (
        <details className="group w-full">
          <summary className="mx-auto inline-flex h-10 cursor-pointer select-none items-center gap-2 rounded-full border border-line bg-paper px-5 text-sm text-ink-2 transition-colors hover:border-accent/60 hover:text-ink">
            <span aria-hidden="true">☕</span>
            {support.donationText || t.defaultDonation}
          </summary>
          <div className="mt-4 flex flex-wrap justify-center gap-6">
            {codes.map((code) => (
              <figure key={code.label} className="flex flex-col items-center gap-2">
                {/* eslint-disable-next-line @next/next/no-img-element -- 后台上传的收款码 */}
                <img
                  src={code.src}
                  alt={format(t.qrAlt, { name: code.label })}
                  loading="lazy"
                  decoding="async"
                  width={160}
                  height={160}
                  className="h-40 w-40 rounded-xl border border-line bg-white object-contain p-1"
                />
                <figcaption className="text-xs text-ink-3">{format(t.qrCaption, { name: code.label })}</figcaption>
              </figure>
            ))}
          </div>
        </details>
      )}
      {sponsor && (
        <p className="flex flex-wrap items-center justify-center gap-2 text-xs text-ink-3">
          <span className="rounded border border-line px-1.5 py-0.5 text-[10px] uppercase tracking-wide">{t.sponsor}</span>
          {support.sponsorUrl ? (
            <a
              href={support.sponsorUrl}
              target="_blank"
              rel="sponsored nofollow noopener noreferrer"
              className="inline-flex items-center gap-2 text-ink-2 transition-colors hover:text-accent-ink"
            >
              {sponsorContent}
            </a>
          ) : (
            <span className="inline-flex items-center gap-2 text-ink-2">{sponsorContent}</span>
          )}
        </p>
      )}
    </aside>
  );
}
