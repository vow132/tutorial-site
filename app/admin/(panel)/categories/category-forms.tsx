"use client";

import { useActionState, useState } from "react";
import {
  createCategory,
  updateCategory,
  deleteCategory,
  type CategoryFormState,
} from "@/lib/actions/categories";

const inputCls =
  "h-10 rounded-xl border border-line bg-white px-3.5 text-sm outline-none transition-colors focus:border-accent";

function Message({ state }: { state: CategoryFormState }) {
  if (state.error) {
    return <span className="text-xs text-red-500">{state.error}</span>;
  }
  if (state.success) {
    return <span className="text-xs text-emerald-600">{state.success}</span>;
  }
  return null;
}

export function CreateCategoryForm() {
  const [state, action, pending] = useActionState<CategoryFormState, FormData>(
    createCategory,
    {}
  );

  return (
    <form action={action} className="mt-4 space-y-3">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <input name="name" required placeholder="名称，如：前端开发" className={inputCls} />
        <input name="slug" required placeholder="slug，如：frontend" className={inputCls} />
        <input name="icon" placeholder="图标 emoji，如：🎨" className={inputCls} />
        <div className="flex items-center gap-2">
          <input
            name="color"
            type="color"
            defaultValue="#6366f1"
            className="h-10 w-12 cursor-pointer rounded-xl border border-line bg-white p-1"
          />
          <span className="text-xs text-ink-3">主题色</span>
        </div>
      </div>
      <div className="flex items-center gap-3">
        <input
          name="description"
          placeholder="一句话描述（可选）"
          className={`${inputCls} flex-1`}
        />
        <button
          type="submit"
          disabled={pending}
          className="h-10 shrink-0 rounded-full bg-ink px-6 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          {pending ? "创建中…" : "创建"}
        </button>
      </div>
      <Message state={state} />
    </form>
  );
}

type Row = {
  id: number;
  name: string;
  slug: string;
  description: string | null;
  icon: string | null;
  color: string;
  order: number;
  tutorials: number;
};

export function CategoryRow({ category }: { category: Row }) {
  const [editing, setEditing] = useState(false);
  const [state, action, pending] = useActionState<CategoryFormState, FormData>(
    updateCategory,
    {}
  );
  const [delState, delAction] = useActionState<CategoryFormState, FormData>(
    deleteCategory,
    {}
  );

  return (
    <div className="rounded-3xl border border-line bg-white p-5">
      <div className="flex items-center justify-between gap-4">
        <div className="flex min-w-0 items-center gap-3">
          <span
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl text-xl"
            style={{ backgroundColor: `${category.color}14` }}
          >
            {category.icon ?? "📚"}
          </span>
          <div className="min-w-0">
            <p className="flex items-center gap-2 font-semibold text-ink">
              {category.name}
              <span className="rounded-full bg-paper px-2 py-0.5 text-xs font-normal text-ink-3">
                {category.tutorials} 篇
              </span>
            </p>
            <p className="truncate text-xs text-ink-3">
              /{category.slug} · {category.description ?? "暂无描述"}
            </p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            onClick={() => setEditing(!editing)}
            className="rounded-lg px-3 py-1.5 text-xs font-medium text-accent transition-colors hover:bg-accent-soft"
          >
            {editing ? "收起" : "编辑"}
          </button>
          <form
            action={delAction}
            onSubmit={(e) => {
              if (!confirm("确定删除该分类吗？")) e.preventDefault();
            }}
          >
            <input type="hidden" name="id" value={category.id} />
            <button
              type="submit"
              className="rounded-lg px-3 py-1.5 text-xs text-red-500 transition-colors hover:bg-red-50"
            >
              删除
            </button>
          </form>
        </div>
      </div>

      {delState.error && (
        <p className="mt-3 rounded-xl bg-red-50 px-4 py-2 text-xs text-red-600">
          {delState.error}
        </p>
      )}

      {editing && (
        <form action={action} className="mt-4 space-y-3 border-t border-line pt-4">
          <input type="hidden" name="id" value={category.id} />
          <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
            <input name="name" required defaultValue={category.name} className={inputCls} />
            <input name="icon" defaultValue={category.icon ?? ""} placeholder="图标" className={inputCls} />
            <input
              name="order"
              type="number"
              defaultValue={category.order}
              title="排序（数字越小越靠前）"
              className={inputCls}
            />
            <input
              name="color"
              type="color"
              defaultValue={category.color}
              className="h-10 w-full cursor-pointer rounded-xl border border-line bg-white p-1"
            />
            <div className="flex items-center gap-2">
              <button
                type="submit"
                disabled={pending}
                className="h-10 rounded-full bg-ink px-5 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
              >
                {pending ? "保存中…" : "保存"}
              </button>
              <Message state={state} />
            </div>
          </div>
          <input
            name="description"
            defaultValue={category.description ?? ""}
            placeholder="一句话描述"
            className={`${inputCls} w-full`}
          />
        </form>
      )}
    </div>
  );
}
