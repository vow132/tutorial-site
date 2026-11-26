"use client";

import { useMemo, useSyncExternalStore } from "react";
import IntentLink from "./intent-link";
import { firstUnread } from "@/lib/series";
import { parseReadingHistory, READING_HISTORY_KEY, subscribeReadingHistory } from "@/lib/reading-history";

/** 原始字符串当快照（稳定、可比较）；服务端和首次渲染为空，hydration 后再读本地记录，不会对不上。 */
const rawSnapshot = () => {
  try {
    return localStorage.getItem(READING_HISTORY_KEY) ?? "";
  } catch {
    return "";
  }
};

export function useReadingHistory(): ReadonlySet<number> {
  const raw = useSyncExternalStore(subscribeReadingHistory, rawSnapshot, () => "");
  return useMemo(() => new Set(parseReadingHistory(raw)), [raw]);
}

/** 目录里每一篇前面的「读完」标记；没读完时占同样宽度，标记出现时不挤动文字。 */
export function ReadMark({ id }: { id: number }) {
  const read = useReadingHistory().has(id);
  return (
    <span aria-hidden={!read} className={`read-mark inline-flex w-4 shrink-0 justify-center text-emerald-600 dark:text-emerald-400 ${read ? "" : "invisible"}`}>
      <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M3.5 8.5 6.5 11.5 12.5 4.5" />
      </svg>
      {read && <span className="sr-only">已读</span>}
    </span>
  );
}

type Item = { id: number; title: string; slug: string; number: number };

/**
 * 系列的阅读进度：已读几篇、进度条和「继续阅读」。服务端渲染时还不知道读过哪些，
 * 显示「从第一篇开始」；hydration 后换成真实进度（同样的结构，不会跳动）。
 */
export function SeriesProgress({ tutorials, compact = false }: { tutorials: Item[]; compact?: boolean }) {
  const read = useReadingHistory();
  const done = tutorials.filter((tutorial) => read.has(tutorial.id)).length;
  const next = firstUnread(tutorials, read);
  const percent = tutorials.length ? Math.round((done / tutorials.length) * 100) : 0;
  return (
    <div className={compact ? "mt-3" : "mt-6 rounded-2xl border border-line bg-surface p-5"}>
      <div className="flex items-center justify-between gap-3 text-xs text-ink-3">
        <span>
          已读 <span className="font-semibold text-ink-2 tabular-nums">{done}</span> / {tutorials.length} 篇
        </span>
        <span className="tabular-nums">{percent}%</span>
      </div>
      <div
        className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-paper"
        role="progressbar"
        aria-label="系列阅读进度"
        aria-valuemin={0}
        aria-valuemax={tutorials.length}
        aria-valuenow={done}
      >
        <div className="h-full rounded-full bg-accent transition-[width] duration-500" style={{ width: `${percent}%` }} />
      </div>
      {!compact &&
        (next ? (
          <IntentLink
            href={`/tutorials/${next.slug}`}
            className="mt-4 inline-flex max-w-full items-center gap-2 rounded-full bg-btn px-4 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90"
          >
            <span className="shrink-0">{done ? "继续阅读" : "从第一篇开始"}</span>
            <span className="truncate opacity-80">第 {next.number} 篇 · {next.title}</span>
          </IntentLink>
        ) : (
          <p className="mt-4 text-sm font-medium text-emerald-600 dark:text-emerald-400">这个系列已经全部读完了 🎉</p>
        ))}
    </div>
  );
}
