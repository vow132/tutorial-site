import Link from "next/link";
import GlowCard from "./glow-card";

type Props = {
  title: string;
  slug: string;
  excerpt: string | null;
  categoryName: string;
  categoryColor: string;
  views: number;
  createdAt: Date;
};

export default function TutorialCard({
  title,
  slug,
  excerpt,
  categoryName,
  categoryColor,
  views,
  createdAt,
}: Props) {
  return (
    <Link href={`/tutorials/${slug}`} className="block h-full">
      <GlowCard className="flex h-full flex-col p-6">
        <div className="flex items-center gap-2 text-xs text-ink-3">
          <span
            className="h-2 w-2 rounded-full"
            style={{ backgroundColor: categoryColor }}
          />
          <span className="font-medium" style={{ color: categoryColor }}>
            {categoryName}
          </span>
          <span>·</span>
          <time>
            {createdAt.toLocaleDateString("zh-CN", {
              year: "numeric",
              month: "short",
              day: "numeric",
            })}
          </time>
        </div>
        <h3 className="mt-3 text-lg font-bold leading-snug text-ink transition-colors group-hover:text-accent">
          {title}
        </h3>
        <p className="mt-2 flex-1 text-sm leading-relaxed text-ink-2 line-clamp-2">
          {excerpt ?? "暂无摘要"}
        </p>
        <div className="mt-4 flex items-center justify-between border-t border-line pt-3 text-xs text-ink-3">
          <span className="flex items-center gap-1">
            <svg width="13" height="13" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.4">
              <path d="M1 7s2.2-4 6-4 6 4 6 4-2.2 4-6 4-6-4-6-4Z" />
              <circle cx="7" cy="7" r="1.8" />
            </svg>
            {views} 阅读
          </span>
          <span className="flex items-center gap-1 font-medium text-ink-2">
            开始阅读
            <svg width="11" height="11" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
              <path d="M1.5 6h9M7 2.5L10.5 6 7 9.5" />
            </svg>
          </span>
        </div>
      </GlowCard>
    </Link>
  );
}
