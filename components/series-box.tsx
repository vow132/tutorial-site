import IntentLink from "./intent-link";
import { seriesPath } from "@/lib/series";

type Props = {
  title: string;
  slug: string;
  tutorials: { id: number; title: string; slug: string }[];
  currentId: number;
};

/** 系列目录较短时默认展开，长了就折叠成一行，免得把正文推得太远。 */
const OPEN_LIMIT = 6;

/** 文章页正文上方的系列目录：第几篇 / 共几篇，展开可跳到系列里任意一篇。 */
export default function SeriesBox({ title, slug, tutorials, currentId }: Props) {
  const index = tutorials.findIndex((t) => t.id === currentId);
  if (index === -1) return null;
  return (
    <nav aria-label="系列目录" className="series-box print-hide mt-8 rounded-2xl border border-line bg-surface p-5">
      <p className="text-xs text-ink-3">
        系列教程 · 第 {index + 1} / {tutorials.length} 篇
      </p>
      <IntentLink href={seriesPath(slug)} className="mt-1 inline-block text-base font-bold text-ink hover:text-accent-ink">
        {title}
      </IntentLink>
      <details open={tutorials.length <= OPEN_LIMIT} className="mt-3 group">
        <summary className="cursor-pointer select-none text-sm text-ink-2 hover:text-ink">本系列目录</summary>
        <ol className="mt-2 space-y-1 text-sm">
          {tutorials.map((t, i) => (
            <li key={t.id} className="flex gap-2">
              <span className="w-5 shrink-0 text-right text-ink-3 tabular-nums">{i + 1}.</span>
              {t.id === currentId ? (
                <span aria-current="page" className="font-semibold text-accent-ink">
                  {t.title}
                </span>
              ) : (
                <IntentLink href={`/tutorials/${t.slug}`} className="text-ink-2 transition-colors hover:text-accent-ink">
                  {t.title}
                </IntentLink>
              )}
            </li>
          ))}
        </ol>
      </details>
    </nav>
  );
}
