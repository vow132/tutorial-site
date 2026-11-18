import IntentLink from "./intent-link";
import { tagPath } from "@/lib/tags";

/** 标签链接一排：文章页、教程列表的「热门标签」、标签页共用。 */
export default function TagChips({
  tags,
  label,
  showCount = false,
  className = "",
}: {
  tags: Array<{ name: string; slug: string; count?: number }>;
  label: string;
  showCount?: boolean;
  className?: string;
}) {
  if (tags.length === 0) return null;
  return (
    <ul className={`flex flex-wrap gap-2 ${className}`} aria-label={label}>
      {tags.map((tag) => (
        <li key={tag.slug}>
          <IntentLink
            href={tagPath(tag.slug)}
            className="inline-flex items-center gap-1.5 rounded-full border border-line bg-surface px-3 py-1 text-xs font-medium text-ink-2 transition-colors hover:border-accent hover:text-accent-ink"
          >
            #{tag.name}
            {showCount && tag.count !== undefined && <span className="text-ink-3">{tag.count}</span>}
          </IntentLink>
        </li>
      ))}
    </ul>
  );
}
