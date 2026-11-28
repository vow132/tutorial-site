"use client";

import { useActionState } from "react";
import { deleteTag, renameTag, type TagFormState } from "@/lib/actions/tags";
import { submitKeepingValues } from "@/lib/form-submit";
import { useAdminI18n } from "@/lib/i18n/client";

/** 一行标签的「改名 / 合并」和「删除」。 */
export function RenameTagForm({ id, name }: { id: number; name: string }) {
  const [state, action, pending] = useActionState<TagFormState, FormData>(renameTag, {});
  const { m, f } = useAdminI18n();
  return (
    <form onSubmit={submitKeepingValues(action)} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="id" value={id} />
      <input
        name="name"
        defaultValue={name}
        aria-label={f(m.admin.tags.newName, { name })}
        className="h-9 w-40 rounded-lg border border-line bg-surface px-3 text-sm outline-none focus:border-accent"
      />
      <button
        type="submit"
        disabled={pending}
        className="h-9 rounded-lg border border-line px-3 text-xs font-medium text-ink-2 transition-colors hover:bg-paper hover:text-ink disabled:opacity-50"
      >
        {pending ? m.admin.common.saving : m.admin.tags.rename}
      </button>
      {state.error && <span className="text-xs text-red-500 dark:text-red-400">{state.error}</span>}
      {state.success && <span className="text-xs text-emerald-600 dark:text-emerald-400">{state.success}</span>}
    </form>
  );
}

export function DeleteTagButton({ id, name }: { id: number; name: string }) {
  const { m, f } = useAdminI18n();
  return (
    <form
      action={deleteTag}
      onSubmit={(event) => {
        if (!confirm(f(m.admin.tags.deleteConfirm, { name }))) event.preventDefault();
      }}
    >
      <input type="hidden" name="id" value={id} />
      <button type="submit" className="rounded-lg px-2.5 py-1.5 text-xs text-red-500 transition-colors hover:bg-red-500/10">
        {m.admin.common.delete}
      </button>
    </form>
  );
}
