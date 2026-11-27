import IntentLink from "./intent-link";
import GlowCard from "./glow-card";
import { categoryTextStyle } from "@/lib/color";
import { assetUrl } from "@/lib/asset-url";
import { getSettings } from "@/lib/settings";
import { getSiteI18n } from "@/lib/i18n/server";

type Props = {
  title: string;
  slug: string;
  excerpt: string | null;
  categoryName: string;
  categoryColor: string;
  views: number;
  createdAt: Date;
  /** 列表缩略图（封面或正文第一张图的小图） */
  thumbnail?: string | null;
};

/** 服务端组件：读站点设置里的图片加速地址（getSettings 每个请求只查一次）。 */
export default async function TutorialCard({
  title,
  slug,
  excerpt,
  categoryName,
  categoryColor,
  views,
  createdAt,
  thumbnail,
}: Props) {
  const [{ assetHost }, { m, date, plural }] = await Promise.all([getSettings(), getSiteI18n()]);
  return (
    <IntentLink href={`/tutorials/${slug}`} className="group block h-full">
      <GlowCard className="flex h-full flex-col p-6">
        <div className="flex items-center gap-2 whitespace-nowrap text-xs text-ink-3">
          <span
            className="h-2 w-2 shrink-0 rounded-full"
            style={{ backgroundColor: categoryColor }}
          />
          <span className="cat-text truncate font-medium" style={categoryTextStyle(categoryColor)}>
            {categoryName}
          </span>
          <span>·</span>
          <time dateTime={createdAt.toISOString()}>
            {date(createdAt, { year: "numeric", month: "short", day: "numeric" })}
          </time>
        </div>
        <div className="mt-3 flex flex-1 gap-4">
          <div className="flex min-w-0 flex-1 flex-col">
            <h3 className="text-lg font-bold leading-snug text-ink transition-colors group-hover:text-accent">
              {title}
            </h3>
            <p className="mt-2 flex-1 text-sm leading-relaxed text-ink-2 line-clamp-2">
              {excerpt ?? m.site.noExcerpt}
            </p>
          </div>
          {thumbnail && (
            // eslint-disable-next-line @next/next/no-img-element -- 上传目录里的 400px 宽 WebP 小图
            <img
              src={assetUrl(thumbnail, assetHost)}
              alt=""
              width={128}
              height={72}
              loading="lazy"
              decoding="async"
              className="card-thumb mt-1 aspect-video w-24 shrink-0 self-start rounded-lg border border-line bg-paper object-cover sm:w-28"
            />
          )}
        </div>
        <div className="mt-4 flex items-center justify-between border-t border-line pt-3 text-xs text-ink-3">
          <span className="flex items-center gap-1">
            <svg width="13" height="13" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
              <path d="M1 7s2.2-4 6-4 6 4 6 4-2.2 4-6 4-6-4-6-4Z" />
              <circle cx="7" cy="7" r="1.8" />
            </svg>
            {plural(views, m.site.views)}
          </span>
          <span className="flex items-center gap-1 font-medium text-ink-2">
            {m.site.card.startReading}
            <svg width="11" height="11" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden="true">
              <path d="M1.5 6h9M7 2.5L10.5 6 7 9.5" />
            </svg>
          </span>
        </div>
      </GlowCard>
    </IntentLink>
  );
}
