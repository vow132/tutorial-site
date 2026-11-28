"use client";

import { useActionState } from "react";
import { addToSeries, deleteSeries, moveInSeries, removeFromSeries, setSeriesChapter, type ChapterFormState } from "@/lib/actions/series";
import { MAX_CHAPTER_TITLE } from "@/lib/series";
import { useAdminI18n } from "@/lib/i18n/client";

function useText() {
  const { m, f } = useAdminI18n();
  return { t: m.admin.series, m, f };
}

const smallBtn =
  "h-8 rounded-lg border border-line px-2.5 text-xs text-ink-2 transition-colors hover:bg-paper hover:text-ink disabled:opacity-30";

/** 系列里一篇教程的「上移 / 下移 / 移出」。 */
export function SeriesItemActions({ tutorialId, title, first, last }: { tutorialId: number; title: string; first: boolean; last: boolean }) {
  const { t, f } = useText();
  return (
    <div className="flex items-center gap-1.5">
      <form action={moveInSeries}>
        <input type="hidden" name="tutorialId" value={tutorialId} />
        <input type="hidden" name="direction" value="up" />
        <button type="submit" disabled={first} className={smallBtn} aria-label={f(t.moveUp, { title })}>
          ↑
        </button>
      </form>
      <form action={moveInSeries}>
        <input type="hidden" name="tutorialId" value={tutorialId} />
        <input type="hidden" name="direction" value="down" />
        <button type="submit" disabled={last} className={smallBtn} aria-label={f(t.moveDown, { title })}>
          ↓
        </button>
      </form>
      <form
        action={removeFromSeries}
        onSubmit={(event) => {
          if (!confirm(f(t.removeConfirm, { title }))) event.preventDefault();
        }}
      >
        <input type="hidden" name="tutorialId" value={tutorialId} />
        <button type="submit" className="h-8 rounded-lg px-2.5 text-xs text-red-500 transition-colors hover:bg-red-500/10">
          {t.remove}
        </button>
      </form>
    </div>
  );
}

/**
 * 一篇教程属于哪一章：相邻、同名的几篇在前台归为一章，留空表示不分章。
 * 候选项是这个系列里已经用过的章节名（datalist），连续几篇填同一个就行。
 */
export function ChapterForm({ tutorialId, title, initial, listId }: { tutorialId: number; title: string; initial: string; listId: string }) {
  const [state, action, pending] = useActionState<ChapterFormState, FormData>(setSeriesChapter, {});
  const { t, m, f } = useText();
  return (
    <form action={action} className="flex items-center gap-1.5">
      <input type="hidden" name="tutorialId" value={tutorialId} />
      <input
        name="chapter"
        defaultValue={initial}
        list={listId}
        maxLength={MAX_CHAPTER_TITLE}
        placeholder={t.chapterPlaceholder}
        aria-label={f(t.chapterLabel, { title })}
        className="h-8 w-32 rounded-lg border border-line bg-surface px-2 text-xs outline-none focus:border-accent sm:w-40"
      />
      <button type="submit" disabled={pending} className={smallBtn}>
        {m.admin.common.save}
      </button>
      <span role="status" className={`text-xs ${state.error ? "text-red-500" : "text-emerald-600 dark:text-emerald-400"}`}>
        {state.error ?? state.success ?? ""}
      </span>
    </form>
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
  const { t, f } = useText();
  if (options.length === 0) return <p className="text-sm text-ink-3">{t.allIn}</p>;
  return (
    <form action={addToSeries} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="seriesId" value={seriesId} />
      <label htmlFor="add-tutorial" className="sr-only">
        {t.chooseTutorial}
      </label>
      <select
        id="add-tutorial"
        name="tutorialId"
        required
        defaultValue=""
        className="h-10 min-w-0 flex-1 rounded-xl border border-line bg-surface px-3 text-sm outline-none focus:border-accent"
      >
        <option value="" disabled>
          {t.chooseTutorialPlaceholder}
        </option>
        {options.map((option) => (
          <option key={option.id} value={option.id}>
            {option.title}
            {option.published ? "" : t.draftSuffix}
            {option.seriesTitle ? f(t.currentSeries, { title: option.seriesTitle }) : ""}
          </option>
        ))}
      </select>
      <button
        type="submit"
        className="h-10 rounded-full border border-line px-4 text-sm font-medium text-ink-2 transition-colors hover:bg-paper hover:text-ink"
      >
        {t.add}
      </button>
    </form>
  );
}

export function DeleteSeriesButton({ id, title }: { id: number; title: string }) {
  const { t, f } = useText();
  return (
    <form
      action={deleteSeries}
      onSubmit={(event) => {
        if (!confirm(f(t.deleteConfirm, { title }))) event.preventDefault();
      }}
    >
      <input type="hidden" name="id" value={id} />
      <button type="submit" className="rounded-full px-4 py-2 text-sm text-red-500 transition-colors hover:bg-red-500/10">
        {t.delete}
      </button>
    </form>
  );
}
