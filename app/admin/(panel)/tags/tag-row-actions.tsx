"use client";

import { useActionState } from "react";
import { deleteTag, renameTag, type TagFormState } from "@/lib/actions/tags";
import { submitKeepingValues } from "@/lib/form-submit";

/** 一行标签的「改名 / 合并」和「删除」。 */
export function RenameTagForm({ id, name }: { id: number; name: string }) {
  const [state, action, pending] = useActionState<TagFormState, FormData>(renameTag, {});
  return (
    <form onSubmit={submitKeepingValues(action)} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="id" value={id} />
      <input
        name="name"
        defaultValue={name}
        aria-label={`标签「${name}」的新名称`}
        className="h-9 w-40 rounded-lg border border-line bg-surface px-3 text-sm outline-none focus:border-accent"
      />
      <button
        type="submit"
        disabled={pending}
        className="h-9 rounded-lg border border-line px-3 text-xs font-medium text-ink-2 transition-colors hover:bg-paper hover:text-ink disabled:opacity-50"
      >
        {pending ? "保存中…" : "改名"}
      </button>
      {state.error && <span className="text-xs text-red-500 dark:text-red-400">{state.error}</span>}
      {state.success && <span className="text-xs text-emerald-600 dark:text-emerald-400">{state.success}</span>}
    </form>
  );
}

export function DeleteTagButton({ id, name }: { id: number; name: string }) {
  return (
    <form
      action={deleteTag}
      onSubmit={(event) => {
        if (!confirm(`确定删除标签「${name}」吗？教程本身不受影响。`)) event.preventDefault();
      }}
    >
      <input type="hidden" name="id" value={id} />
      <button type="submit" className="rounded-lg px-2.5 py-1.5 text-xs text-red-500 transition-colors hover:bg-red-500/10">
        删除
      </button>
    </form>
  );
}
