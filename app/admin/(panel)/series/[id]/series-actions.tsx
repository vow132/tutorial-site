"use client";

import { addToSeries, deleteSeries, moveInSeries, removeFromSeries } from "@/lib/actions/series";

const smallBtn =
  "h-8 rounded-lg border border-line px-2.5 text-xs text-ink-2 transition-colors hover:bg-paper hover:text-ink disabled:opacity-30";

/** 系列里一篇教程的「上移 / 下移 / 移出」。 */
export function SeriesItemActions({ tutorialId, title, first, last }: { tutorialId: number; title: string; first: boolean; last: boolean }) {
  return (
    <div className="flex items-center gap-1.5">
      <form action={moveInSeries}>
        <input type="hidden" name="tutorialId" value={tutorialId} />
        <input type="hidden" name="direction" value="up" />
        <button type="submit" disabled={first} className={smallBtn} aria-label={`上移「${title}」`}>
          ↑
        </button>
      </form>
      <form action={moveInSeries}>
        <input type="hidden" name="tutorialId" value={tutorialId} />
        <input type="hidden" name="direction" value="down" />
        <button type="submit" disabled={last} className={smallBtn} aria-label={`下移「${title}」`}>
          ↓
        </button>
      </form>
      <form
        action={removeFromSeries}
        onSubmit={(event) => {
          if (!confirm(`把「${title}」移出这个系列吗？教程本身不受影响。`)) event.preventDefault();
        }}
      >
        <input type="hidden" name="tutorialId" value={tutorialId} />
        <button type="submit" className="h-8 rounded-lg px-2.5 text-xs text-red-500 transition-colors hover:bg-red-500/10">
          移出
        </button>
      </form>
    </div>
  );
}

/** 从现有教程里挑一篇加入系列（排在末尾）。 */
export function AddToSeriesForm({
  seriesId,
  options,
}: {
  seriesId: number;
  options: { id: number; title: string; published: boolean; seriesTitle: string | null }[];
}) {
  if (options.length === 0) return <p className="text-sm text-ink-3">所有教程都已经在这个系列里了。</p>;
  return (
    <form action={addToSeries} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="seriesId" value={seriesId} />
      <label htmlFor="add-tutorial" className="sr-only">
        选择要加入的教程
      </label>
      <select
        id="add-tutorial"
        name="tutorialId"
        required
        defaultValue=""
        className="h-10 min-w-0 flex-1 rounded-xl border border-line bg-surface px-3 text-sm outline-none focus:border-accent"
      >
        <option value="" disabled>
          选择要加入的教程…
        </option>
        {options.map((option) => (
          <option key={option.id} value={option.id}>
            {option.title}
            {option.published ? "" : "（草稿）"}
            {option.seriesTitle ? ` — 现属「${option.seriesTitle}」` : ""}
          </option>
        ))}
      </select>
      <button
        type="submit"
        className="h-10 rounded-full border border-line px-4 text-sm font-medium text-ink-2 transition-colors hover:bg-paper hover:text-ink"
      >
        加入系列
      </button>
    </form>
  );
}

export function DeleteSeriesButton({ id, title }: { id: number; title: string }) {
  return (
    <form
      action={deleteSeries}
      onSubmit={(event) => {
        if (!confirm(`确定删除系列「${title}」吗？系列里的教程会保留，只是不再属于任何系列。`)) event.preventDefault();
      }}
    >
      <input type="hidden" name="id" value={id} />
      <button type="submit" className="rounded-full px-4 py-2 text-sm text-red-500 transition-colors hover:bg-red-500/10">
        删除系列
      </button>
    </form>
  );
}
