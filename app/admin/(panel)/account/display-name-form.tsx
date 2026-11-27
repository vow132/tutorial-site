"use client";

import { useActionState } from "react";
import { updateDisplayName, type CredentialsFormState } from "@/lib/actions/account";
import { MAX_DISPLAY_NAME } from "@/lib/roles";
import { useAdminI18n } from "@/lib/i18n/client";

/** 自己的署名：文章页「作者」处显示，留空不显示（登录用户名不会出现在前台）。 */
export default function DisplayNameForm({ initial }: { initial: string }) {
  const [state, action, pending] = useActionState<CredentialsFormState, FormData>(updateDisplayName, {});
  const { m } = useAdminI18n();
  const t = m.admin.account;
  return (
    <form action={action} className="flex flex-wrap items-end gap-3">
      <label className="min-w-0 flex-1 text-sm font-medium text-ink-2">
        {t.byline}
        <input
          name="displayName"
          defaultValue={initial}
          maxLength={MAX_DISPLAY_NAME}
          placeholder={t.bylinePlaceholder}
          className="mt-1.5 h-11 w-full rounded-xl border border-line bg-paper px-4 text-sm outline-none transition-colors focus:border-accent focus:bg-surface focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent/60"
        />
      </label>
      <button
        type="submit"
        disabled={pending}
        className="h-11 rounded-full border border-line px-5 text-sm text-ink-2 transition-colors hover:bg-paper hover:text-ink disabled:opacity-50"
      >
        {pending ? m.admin.common.saving : t.bylineSubmit}
      </button>
      {(state.error || state.success) && (
        <p role="status" className={`w-full text-sm ${state.error ? "text-red-500" : "text-emerald-600 dark:text-emerald-400"}`}>
          {state.error ?? state.success}
        </p>
      )}
    </form>
  );
}
