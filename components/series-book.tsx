import IntentLink from "./intent-link";
import { ReadMark, SeriesProgress } from "./reading-history";
import { groupByChapter, seriesPath } from "@/lib/series";
import type { Messages } from "@/lib/i18n/messages";
import { format } from "@/lib/i18n/format";

type Props = {
  title: string;
  slug: string;
  tutorials: { id: number; title: string; slug: string; seriesChapter?: string | null }[];
  currentId: number;
  /** inline：正文上方（手机和平板）；sidebar：桌面右侧栏，本页目录上面 */
  variant: "inline" | "sidebar";
  /** 网站语言的文案 */
  m: Messages;
};

/** 目录较短时默认展开，长了正文上方就折叠成一行，免得把正文推得太远。 */
const OPEN_LIMIT = 6;

/**
 * 文章页的「教程书」目录：系列名、第几篇、阅读进度，按章节列出全部教程，
 * 读完的打勾（只记在本浏览器里，见 lib/reading-history.ts），当前这篇高亮。
 */
export default function SeriesBook({ title, slug, tutorials, currentId, variant, m }: Props) {
  const tx = m.site.article;
  const index = tutorials.findIndex((t) => t.id === currentId);
  if (index === -1) return null;
  const groups = groupByChapter(tutorials);
  const items = groups.flatMap((group) => group.items);
  const sidebar = variant === "sidebar";

  const list = (
    <div className={sidebar ? "mt-3 max-h-[45vh] overflow-y-auto overscroll-contain pr-1" : "mt-2"}>
      {groups.map((group, groupIndex) => (
        <div key={`${groupIndex}-${group.chapter ?? ""}`} className={groupIndex ? "mt-3" : ""}>
          {group.chapter && <p className="mb-1 text-xs font-semibold text-ink-3">{group.chapter}</p>}
          <ol className="space-y-1 text-sm">
            {group.items.map((t) => (
              <li key={t.id} className="flex items-start gap-1.5">
                <ReadMark id={t.id} />
                <span className="w-5 shrink-0 text-right text-ink-3 tabular-nums">{t.number}.</span>
                {t.id === currentId ? (
                  <span aria-current="page" className="min-w-0 font-semibold text-accent-ink">
                    {t.title}
                  </span>
                ) : (
                  <IntentLink href={`/tutorials/${t.slug}`} className="min-w-0 text-ink-2 transition-colors hover:text-accent-ink">
                    {t.title}
                  </IntentLink>
                )}
              </li>
            ))}
          </ol>
        </div>
      ))}
    </div>
  );

  return (
    <nav
      aria-label={sidebar ? tx.bookAriaSidebar : tx.bookAriaInline}
      className={sidebar ? "series-book-sidebar" : "series-box print-hide mt-8 rounded-2xl border border-line bg-surface p-5 lg:hidden"}
    >
      <p className={sidebar ? "text-xs font-semibold uppercase tracking-widest text-ink-3" : "text-xs text-ink-3"}>
        {format(tx.bookPosition, { label: sidebar ? tx.bookTitle : tx.seriesTitle, index: index + 1, total: tutorials.length })}
      </p>
      <IntentLink
        href={seriesPath(slug)}
        className={`mt-1 inline-block font-bold text-ink hover:text-accent-ink ${sidebar ? "text-sm" : "text-base"}`}
      >
        {title}
      </IntentLink>
      <SeriesProgress tutorials={items} compact />
      {sidebar ? (
        list
      ) : (
        <details open={tutorials.length <= OPEN_LIMIT} className="group mt-3">
          <summary className="cursor-pointer select-none text-sm text-ink-2 hover:text-ink">{tx.bookToggle}</summary>
          {list}
        </details>
      )}
    </nav>
  );
}
