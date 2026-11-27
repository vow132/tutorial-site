"use client";

import { useEffect, useRef, useState } from "react";
import { useAdminI18n } from "@/lib/i18n/client";

type Item = { name: string; url: string; preview: string };

/**
 * 「从图片库插入」：列出上传过的图片（/api/admin/media，按文件名搜索、分页），点一张插进正文。
 * 用原生 <dialog>：自带焦点管理、Esc 关闭。
 */
export default function MediaPicker({ open, onClose, onPick }: { open: boolean; onClose: () => void; onPick: (url: string) => void }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<{ items: Item[]; page: number; pages: number } | null>(null);
  const [error, setError] = useState("");
  const { m } = useAdminI18n();
  const t = m.admin.media;

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      try {
        const response = await fetch(`/api/admin/media?${new URLSearchParams({ q: query, page: String(page) })}`, { signal: controller.signal });
        const json = await response.json();
        if (!response.ok) throw new Error(json.error || t.loadFailed);
        setData(json);
        setError("");
      } catch (err) {
        if (!controller.signal.aborted) setError(err instanceof Error ? err.message : t.loadFailed);
      }
    }, 200);
    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [open, query, page]);

  return (
    <dialog
      ref={dialogRef}
      onClose={onClose}
      aria-labelledby="media-picker-title"
      className="m-auto w-[min(56rem,calc(100vw-2rem))] rounded-3xl border border-line bg-surface p-0 text-ink shadow-lifted backdrop:bg-black/40"
    >
      <div className="flex items-center gap-3 border-b border-line px-5 py-4">
        <h2 id="media-picker-title" className="text-base font-semibold">
          {t.pickerTitle}
        </h2>
        <input
          type="search"
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setPage(1);
          }}
          placeholder={t.search}
          aria-label={t.search}
          className="ml-auto h-9 w-48 rounded-xl border border-line bg-surface px-3 text-sm outline-none focus:border-accent"
        />
        <button type="button" onClick={onClose} className="h-9 rounded-full px-3 text-sm text-ink-2 hover:bg-paper">
          {m.admin.common.close}
        </button>
      </div>
      <div className="max-h-[60vh] overflow-y-auto p-5">
        {error ? (
          <p role="alert" className="text-sm text-red-500">
            {error}
          </p>
        ) : !data ? (
          <p className="text-sm text-ink-3">{m.admin.common.loading}</p>
        ) : data.items.length === 0 ? (
          <p className="text-sm text-ink-3">{query ? t.noMatch : t.emptyShort}</p>
        ) : (
          <ul className="grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-6">
            {data.items.map((item) => (
              <li key={item.name}>
                <button
                  type="button"
                  onClick={() => onPick(item.url)}
                  title={item.name}
                  className="block w-full overflow-hidden rounded-xl border border-line transition-colors hover:border-accent focus-visible:outline-2 focus-visible:outline-accent"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element -- 上传目录的静态文件 */}
                  <img src={item.preview} alt={item.name} loading="lazy" className="aspect-square w-full bg-paper object-cover" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
      {data && data.pages > 1 && (
        <div className="flex items-center justify-center gap-3 border-t border-line px-5 py-3 text-sm">
          <button type="button" disabled={page <= 1} onClick={() => setPage(page - 1)} className="rounded-full px-3 py-1 text-ink-2 hover:bg-paper disabled:opacity-40">
            {t.prev}
          </button>
          <span className="text-ink-3 tabular-nums">
            {data.page} / {data.pages}
          </span>
          <button type="button" disabled={page >= data.pages} onClick={() => setPage(page + 1)} className="rounded-full px-3 py-1 text-ink-2 hover:bg-paper disabled:opacity-40">
            {t.next}
          </button>
        </div>
      )}
    </dialog>
  );
}
