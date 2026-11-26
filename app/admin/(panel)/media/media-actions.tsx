"use client";

import { useActionState, useState } from "react";
import { cleanUnusedMedia, deleteMedia, type MediaActionState } from "@/lib/actions/media";

const smallBtn =
  "h-8 rounded-lg border border-line px-2.5 text-xs text-ink-2 transition-colors hover:bg-paper hover:text-ink disabled:opacity-40";

/** 复制图片地址（/uploads/…），可以贴进封面、设置或别的地方。 */
export function CopyUrlButton({ url }: { url: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      className={smallBtn}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(url);
          setCopied(true);
          window.setTimeout(() => setCopied(false), 1500);
        } catch {
          window.prompt("复制图片地址：", url);
        }
      }}
    >
      {copied ? "已复制" : "复制地址"}
    </button>
  );
}

/** 删除一张没被引用的图片；最近上传的多确认一次（可能在还没保存的草稿里）。 */
export function DeleteMediaButton({ name, recent }: { name: string; recent: boolean }) {
  const [state, action, pending] = useActionState<MediaActionState, FormData>(deleteMedia, {});
  return (
    <form
      action={action}
      onSubmit={(event) => {
        const note = recent ? "\n\n这张是最近几天上传的，可能在还没保存的草稿里。" : "";
        if (!confirm(`删除 ${name}？文件会移到上传目录的 .trash 里，需要时可以移回来。${note}`)) event.preventDefault();
      }}
      className="contents"
    >
      <input type="hidden" name="name" value={name} />
      <button type="submit" disabled={pending} className="h-8 rounded-lg px-2.5 text-xs text-red-500 transition-colors hover:bg-red-500/10">
        删除
      </button>
      {state.error && (
        <span role="alert" className="basis-full text-xs text-red-500">
          {state.error}
        </span>
      )}
    </form>
  );
}

/** 一键清理所有没被引用、不是最近上传的图片。 */
export function CleanUnusedForm({ count, size }: { count: number; size: string }) {
  const [state, action, pending] = useActionState<MediaActionState, FormData>(cleanUnusedMedia, {});
  return (
    <form
      action={action}
      onSubmit={(event) => {
        if (!confirm(`清理 ${count} 张没被任何教程、历史版本或设置引用的图片（${size}）？文件会移到上传目录的 .trash 里。`)) event.preventDefault();
      }}
      className="flex flex-wrap items-center gap-3"
    >
      <button
        type="submit"
        disabled={pending || count === 0}
        className="h-9 rounded-full border border-line px-4 text-sm font-medium text-ink-2 transition-colors hover:bg-paper hover:text-ink disabled:opacity-40"
      >
        清理没用的图片{count ? `（${count} 张，${size}）` : ""}
      </button>
      {(state.success || state.error) && (
        <span role="status" className={`text-sm ${state.error ? "text-red-500" : "text-emerald-600 dark:text-emerald-400"}`}>
          {state.error ?? state.success}
        </span>
      )}
    </form>
  );
}
