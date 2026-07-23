"use client";

import { useActionState } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import type { TutorialFormState } from "@/lib/actions/tutorials";

const RichTextEditor = dynamic(
  () => import("@/components/editor/rich-text-editor"),
  {
    ssr: false,
    loading: () => (
      <div className="min-h-[460px] animate-pulse rounded-2xl border border-line bg-paper" />
    ),
  },
);

type Category = { id: number; name: string };

type Props = {
  categories: Category[];
  action: (prev: TutorialFormState, formData: FormData) => Promise<TutorialFormState>;
  initial?: {
    title: string;
    slug: string;
    excerpt: string | null;
    content: string;
    categoryId: number;
    published: boolean;
  };
};

const inputCls =
  "h-11 w-full rounded-xl border border-line bg-white px-4 text-sm outline-none transition-colors focus:border-accent";

export default function TutorialForm({ categories, action, initial }: Props) {
  const [state, formAction, pending] = useActionState<TutorialFormState, FormData>(
    action,
    {}
  );

  return (
    <form action={formAction} className="space-y-5">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div className="md:col-span-2">
          <label className="mb-1.5 block text-sm font-medium text-ink-2">
            标题 <span className="text-red-400">*</span>
          </label>
          <input
            name="title"
            required
            defaultValue={initial?.title}
            placeholder="例如：CSS Flexbox 布局完全指南"
            className={inputCls}
          />
        </div>

        <div>
          <label className="mb-1.5 block text-sm font-medium text-ink-2">
            Slug（URL 别名）
          </label>
          <input
            name="slug"
            defaultValue={initial?.slug}
            placeholder="留空则根据标题生成"
            className={inputCls}
          />
        </div>

        <div>
          <label className="mb-1.5 block text-sm font-medium text-ink-2">
            分类 <span className="text-red-400">*</span>
          </label>
          <select
            name="categoryId"
            required
            defaultValue={initial?.categoryId ?? ""}
            className={inputCls}
          >
            <option value="" disabled>
              选择分类
            </option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>

        <div className="md:col-span-2">
          <label className="mb-1.5 block text-sm font-medium text-ink-2">
            摘要（展示在卡片与搜索结果中）
          </label>
          <textarea
            name="excerpt"
            rows={2}
            defaultValue={initial?.excerpt ?? ""}
            placeholder="一两句话概括这篇教程讲什么…"
            className="w-full rounded-xl border border-line bg-white px-4 py-3 text-sm outline-none transition-colors focus:border-accent"
          />
        </div>
      </div>

      <div>
        <label className="mb-1.5 block text-sm font-medium text-ink-2">
          正文 <span className="text-red-400">*</span>
          <span className="ml-2 text-xs font-normal text-ink-3">
            支持拖拽图片、粘贴截图
          </span>
        </label>
        <RichTextEditor name="content" initialContent={initial?.content ?? ""} />
      </div>

      {state.error && (
        <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-600">
          {state.error}
        </p>
      )}

      <div className="flex items-center justify-between rounded-2xl border border-line bg-white px-5 py-4">
        <label className="flex cursor-pointer items-center gap-2.5 text-sm font-medium text-ink-2">
          <input
            type="checkbox"
            name="published"
            defaultChecked={initial?.published ?? true}
            className="h-4 w-4 accent-[#6366f1]"
          />
          立即发布（不勾选则保存为草稿）
        </label>
        <div className="flex items-center gap-3">
          <Link
            href="/admin/tutorials"
            className="rounded-full px-5 py-2.5 text-sm font-medium text-ink-2 transition-colors hover:text-ink"
          >
            取消
          </Link>
          <button
            type="submit"
            disabled={pending}
            className="rounded-full bg-ink px-7 py-2.5 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {pending ? "保存中…" : "保存教程"}
          </button>
        </div>
      </div>
    </form>
  );
}
