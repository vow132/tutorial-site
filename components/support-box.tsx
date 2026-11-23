import type { SupportSettings } from "@/lib/settings-extras";

/**
 * 文末的打赏与赞助（站点设置 →「赞助与打赏」）。都没设置时什么也不渲染。
 * 打赏用原生 <details> 展开收款码，不需要脚本；赞助链接带 rel="sponsored"。
 */
export default function SupportBox({ support }: { support: SupportSettings }) {
  const codes = [
    { src: support.wechatQr, label: "微信" },
    { src: support.alipayQr, label: "支付宝" },
  ].filter((code) => code.src);
  const sponsor = support.sponsorText;
  if (codes.length === 0 && !sponsor) return null;

  const sponsorContent = (
    <>
      {support.sponsorImage && (
        // eslint-disable-next-line @next/next/no-img-element -- 后台上传的静态图片
        <img src={support.sponsorImage} alt="" loading="lazy" decoding="async" className="max-h-12 w-auto rounded-md" />
      )}
      <span>{sponsor}</span>
    </>
  );

  return (
    <aside aria-label="支持本站" className="support-box print-hide mt-6 flex flex-col items-center gap-4 text-center">
      {codes.length > 0 && (
        <details className="group w-full">
          <summary className="mx-auto inline-flex h-10 cursor-pointer select-none items-center gap-2 rounded-full border border-line bg-paper px-5 text-sm text-ink-2 transition-colors hover:border-accent/60 hover:text-ink">
            <span aria-hidden="true">☕</span>
            {support.donationText || "觉得有用？请作者喝杯咖啡"}
          </summary>
          <div className="mt-4 flex flex-wrap justify-center gap-6">
            {codes.map((code) => (
              <figure key={code.label} className="flex flex-col items-center gap-2">
                {/* eslint-disable-next-line @next/next/no-img-element -- 后台上传的收款码 */}
                <img
                  src={code.src}
                  alt={`${code.label}收款码`}
                  loading="lazy"
                  decoding="async"
                  width={160}
                  height={160}
                  className="h-40 w-40 rounded-xl border border-line bg-white object-contain p-1"
                />
                <figcaption className="text-xs text-ink-3">{code.label}扫码</figcaption>
              </figure>
            ))}
          </div>
        </details>
      )}
      {sponsor && (
        <p className="flex flex-wrap items-center justify-center gap-2 text-xs text-ink-3">
          <span className="rounded border border-line px-1.5 py-0.5 text-[10px] uppercase tracking-wide">赞助</span>
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
