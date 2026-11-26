"use client";

import { useActionState } from "react";
import dynamic from "next/dynamic";
import { updateAbout, type AboutFormState } from "@/lib/actions/about";
import { submitKeepingValues } from "@/lib/form-submit";

const RichTextEditor = dynamic(() => import("@/components/editor/rich-text-editor"), {
  ssr: false,
  loading: () => <div className="min-h-[460px] animate-pulse rounded-2xl border border-line bg-paper" />,
});

export default function AboutForm({ title, content, mediaLibrary = false }: { title: string; content: string; mediaLibrary?: boolean }) {
  const [state, action, pending] = useActionState<AboutFormState, FormData>(updateAbout, {});
  return (
    // 保存后保留当前内容（React 19 的 form action 默认会重置表单）
    <form onSubmit={submitKeepingValues(action)} className="space-y-5">
      <div>
        <label htmlFor="about-title" className="mb-1.5 block text-sm font-medium text-ink-2">
          页面标题
        </label>
        <input
          id="about-title"
          name="title"
          defaultValue={title}
          maxLength={60}
          className="h-11 w-full rounded-xl border border-line bg-surface px-4 text-sm outline-none transition-colors focus:border-accent"
        />
      </div>
      <div>
        <span className="mb-1.5 block text-sm font-medium text-ink-2">
          正文
          <span className="ml-2 text-xs font-normal text-ink-3">
            介绍网站、作者和联系方式；清空后前台不显示关于页面
          </span>
        </span>
        <RichTextEditor name="content" initialContent={content} mediaLibrary={mediaLibrary} />
      </div>
      {state.error && (
        <p className="rounded-xl bg-red-500/10 px-4 py-3 text-sm text-red-500 dark:text-red-400">{state.error}</p>
      )}
      {state.success && (
        <p className="rounded-xl bg-emerald-500/10 px-4 py-3 text-sm text-emerald-600 dark:text-emerald-400">
          {state.success}
        </p>
      )}
      <button
        type="submit"
        disabled={pending}
        className="rounded-full bg-btn px-7 py-2.5 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
      >
        {pending ? "保存中…" : "保存关于页面"}
      </button>
    </form>
  );
}
