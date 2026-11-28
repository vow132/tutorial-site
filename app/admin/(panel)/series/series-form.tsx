"use client";

import { useActionState } from "react";
import type { SeriesFormState } from "@/lib/actions/series";
import { submitKeepingValues } from "@/lib/form-submit";
import { MAX_SERIES_DESCRIPTION, MAX_SERIES_TITLE } from "@/lib/series";
import { useAdminI18n } from "@/lib/i18n/client";

const inputCls =
  "h-10 w-full rounded-xl border border-line bg-surface px-3 text-sm outline-none transition-colors focus:border-accent";

/** 新建 / 编辑系列（名称、网址别名、简介）。 */
export default function SeriesForm({
  action,
  initial,
  submitLabel,
}: {
  action: (prev: SeriesFormState, formData: FormData) => Promise<SeriesFormState>;
  initial?: { title: string; slug: string; description: string | null };
  submitLabel: string;
}) {
  const [state, formAction, pending] = useActionState<SeriesFormState, FormData>(action, {});
  const { m } = useAdminI18n();
  const t = m.admin.series;
  return (
    <form onSubmit={submitKeepingValues(formAction)} className="grid gap-4 sm:grid-cols-2">
      <div>
        <label htmlFor="series-title" className="mb-1.5 block text-sm font-medium text-ink-2">
          {t.title} <span className="text-red-400">*</span>
        </label>
        <input
          id="series-title"
          name="title"
          required
          maxLength={MAX_SERIES_TITLE}
          defaultValue={initial?.title}
          placeholder={t.titlePlaceholder}
          className={inputCls}
        />
      </div>
      <div>
        <label htmlFor="series-slug" className="mb-1.5 block text-sm font-medium text-ink-2">
          {t.slug}
        </label>
        <input id="series-slug" name="slug" defaultValue={initial?.slug} placeholder={t.slugPlaceholder} className={inputCls} />
      </div>
      <div className="sm:col-span-2">
        <label htmlFor="series-description" className="mb-1.5 block text-sm font-medium text-ink-2">
          {t.description}
        </label>
        <textarea
          id="series-description"
          name="description"
          rows={2}
          maxLength={MAX_SERIES_DESCRIPTION}
          defaultValue={initial?.description ?? ""}
          className="w-full rounded-xl border border-line bg-surface px-3 py-2 text-sm outline-none transition-colors focus:border-accent"
        />
      </div>
      <div className="flex items-center gap-3 sm:col-span-2">
        <button
          type="submit"
          disabled={pending}
          className="h-10 rounded-full bg-btn px-5 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          {pending ? m.admin.common.saving : submitLabel}
        </button>
        {state.error && <p className="text-sm text-red-500 dark:text-red-400">{state.error}</p>}
        {state.success && (
          <p role="status" className="text-sm text-emerald-600 dark:text-emerald-400">
            {state.success}
          </p>
        )}
      </div>
    </form>
  );
}
