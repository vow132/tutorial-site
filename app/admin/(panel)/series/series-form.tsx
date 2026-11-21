"use client";

import { useActionState } from "react";
import type { SeriesFormState } from "@/lib/actions/series";
import { submitKeepingValues } from "@/lib/form-submit";
import { MAX_SERIES_DESCRIPTION, MAX_SERIES_TITLE } from "@/lib/series";

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
  return (
    <form onSubmit={submitKeepingValues(formAction)} className="grid gap-4 sm:grid-cols-2">
      <div>
        <label htmlFor="series-title" className="mb-1.5 block text-sm font-medium text-ink-2">
          系列名称 <span className="text-red-400">*</span>
        </label>
        <input
          id="series-title"
          name="title"
          required
          maxLength={MAX_SERIES_TITLE}
          defaultValue={initial?.title}
          placeholder="例如：从零搭建个人博客"
          className={inputCls}
        />
      </div>
      <div>
        <label htmlFor="series-slug" className="mb-1.5 block text-sm font-medium text-ink-2">
          网址别名
        </label>
        <input id="series-slug" name="slug" defaultValue={initial?.slug} placeholder="留空则根据名称生成" className={inputCls} />
      </div>
      <div className="sm:col-span-2">
        <label htmlFor="series-description" className="mb-1.5 block text-sm font-medium text-ink-2">
          简介（显示在系列页和搜索结果里）
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
          {pending ? "保存中…" : submitLabel}
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
