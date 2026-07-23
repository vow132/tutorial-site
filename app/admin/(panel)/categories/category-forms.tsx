"use client";

import { useActionState } from "react";
import {
  createCategory,
  updateCategory,
  deleteCategory,
  type CategoryFormState,
} from "@/lib/actions/categories";

const inputCls =
  "h-10 w-full rounded-xl border border-line bg-white px-3.5 text-sm outline-none transition-colors focus:border-accent";

export type ParentOption = {
  id: number;
  name: string;
  depth: number;
};

function Message({ state }: { state: CategoryFormState }) {
  if (state.error) {
    return <span className="text-xs text-red-500">{state.error}</span>;
  }
  if (state.success) {
    return <span className="text-xs text-emerald-600">{state.success}</span>;
  }
  return null;
}

function Field({
  label,
  hint,
  children,
  className = "",
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <label className={`block min-w-0 ${className}`}>
      <span className="mb-1.5 flex items-center gap-1 text-xs font-medium text-ink-2">
        {label}
        {hint && <span className="font-normal text-ink-3">{hint}</span>}
      </span>
      {children}
    </label>
  );
}

function ParentSelect({
  options,
  defaultValue,
}: {
  options: ParentOption[];
  defaultValue?: number | null;
}) {
  return (
    <select
      name="parentId"
      defaultValue={defaultValue ?? ""}
      className={inputCls}
    >
      <option value="">无（作为一级分类）</option>
      {options.map((option) => (
        <option key={option.id} value={option.id}>
          {`${"　".repeat(option.depth)}${option.name}（${option.depth + 1}级）`}
        </option>
      ))}
    </select>
  );
}

export function CreateCategoryForm({
  parentOptions,
}: {
  parentOptions: ParentOption[];
}) {
  const [state, action, pending] = useActionState<CategoryFormState, FormData>(
    createCategory,
    {},
  );
  const availableParents = parentOptions.filter((option) => option.depth < 2);

  return (
    <form action={action} className="mt-4 space-y-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Field label="分类名称">
          <input
            name="name"
            required
            maxLength={60}
            placeholder="如：前端开发"
            className={inputCls}
          />
        </Field>
        <Field label="Slug">
          <input
            name="slug"
            required
            maxLength={80}
            placeholder="如：frontend"
            className={inputCls}
          />
        </Field>
        <Field label="父分类" hint="（可选）">
          <ParentSelect options={availableParents} />
        </Field>
        <div className="grid grid-cols-[1fr_auto] gap-3">
          <Field label="图标" hint="（可选）">
            <input name="icon" placeholder="如：🎨" className={inputCls} />
          </Field>
          <Field label="主题色">
            <input
              name="color"
              type="color"
              defaultValue="#6366f1"
              className="h-10 w-14 cursor-pointer rounded-xl border border-line bg-white p-1"
            />
          </Field>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        <Field label="分类描述" hint="（可选）">
          <input
            name="description"
            maxLength={300}
            placeholder="一句话描述"
            className={inputCls}
          />
        </Field>
        <Field label="跳转链接" hint="（可选，填写后点击分类会直接跳转）">
          <input
            name="linkUrl"
            maxLength={500}
            placeholder="/站内路径 或 https://example.com"
            className={inputCls}
          />
        </Field>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className="h-10 shrink-0 rounded-full bg-ink px-6 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          {pending ? "创建中…" : "创建分类"}
        </button>
        <Message state={state} />
      </div>
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
  linkUrl: string | null;
  parentId: number | null;
  parentName: string | null;
  depth: number;
  children: number;
  descendantIds: number[];
  tutorials: number;
};

export function CategoryRow({
  category,
  parentOptions,
}: {
  category: Row;
  parentOptions: ParentOption[];
}) {
  const [state, action, pending] = useActionState<CategoryFormState, FormData>(
    updateCategory,
    {},
  );
  const [delState, delAction] = useActionState<CategoryFormState, FormData>(
    deleteCategory,
    {},
  );

  const descendants = new Set(category.descendantIds);
  const subtreeHeight = Math.max(
    0,
    ...parentOptions
      .filter((option) => descendants.has(option.id))
      .map((option) => option.depth - category.depth),
  );
  const availableParents = parentOptions.filter(
    (option) =>
      option.id !== category.id &&
      !descendants.has(option.id) &&
      option.depth + 1 + subtreeHeight < 3,
  );

  return (
    <div
      className="rounded-3xl border border-line bg-white p-4 sm:p-5"
      style={{ marginLeft: category.depth ? `${category.depth * 1.25}rem` : 0 }}
    >
      <input
        id={`edit-category-${category.id}`}
        type="checkbox"
        className="peer sr-only"
        aria-label={`编辑${category.name}`}
      />
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-center gap-3">
          <span
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl text-xl"
            style={{ backgroundColor: `${category.color}14` }}
          >
            {category.icon ?? "📚"}
          </span>
          <div className="min-w-0">
            <p className="flex flex-wrap items-center gap-2 font-semibold text-ink">
              {category.name}
              <span className="rounded-full bg-accent-soft px-2 py-0.5 text-xs font-normal text-accent">
                {category.depth + 1}级分类
              </span>
              <span className="rounded-full bg-paper px-2 py-0.5 text-xs font-normal text-ink-3">
                {category.tutorials} 篇
              </span>
              {category.children > 0 && (
                <span className="rounded-full bg-paper px-2 py-0.5 text-xs font-normal text-ink-3">
                  {category.children} 个子分类
                </span>
              )}
            </p>
            <p className="mt-1 truncate text-xs text-ink-3">
              /{category.slug}
              {category.parentName ? ` · 父分类：${category.parentName}` : ""}
            </p>
            {category.linkUrl && (
              <p className="mt-1 truncate text-xs text-accent">
                跳转：{category.linkUrl}
              </p>
            )}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2 self-end sm:self-auto">
          <label
            htmlFor={`edit-category-${category.id}`}
            role="button"
            tabIndex={0}
            className="cursor-pointer rounded-lg px-3 py-1.5 text-xs font-medium text-accent transition-colors hover:bg-accent-soft focus-visible:outline-2 focus-visible:outline-accent"
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                document.getElementById(`edit-category-${category.id}`)?.click();
              }
            }}
          >
            编辑
          </label>
          <form
            action={delAction}
            onSubmit={(event) => {
              if (!confirm("确定删除该分类吗？")) event.preventDefault();
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

      <div className="hidden peer-checked:block">
        <form action={action} className="mt-4 space-y-4 border-t border-line pt-4">
          <input type="hidden" name="id" value={category.id} />
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <Field label="分类名称">
              <input
                name="name"
                required
                maxLength={60}
                defaultValue={category.name}
                className={inputCls}
              />
            </Field>
            <Field label="Slug">
              <input
                name="slug"
                required
                maxLength={80}
                defaultValue={category.slug}
                className={inputCls}
              />
            </Field>
            <Field label="父分类">
              <ParentSelect
                options={availableParents}
                defaultValue={category.parentId}
              />
            </Field>
            <Field label="排序" hint="（越小越靠前）">
              <input
                name="order"
                type="number"
                defaultValue={category.order}
                className={inputCls}
              />
            </Field>
            <div className="grid grid-cols-[1fr_auto] gap-3">
              <Field label="图标">
                <input
                  name="icon"
                  defaultValue={category.icon ?? ""}
                  placeholder="如：🎨"
                  className={inputCls}
                />
              </Field>
              <Field label="主题色">
                <input
                  name="color"
                  type="color"
                  defaultValue={category.color}
                  className="h-10 w-14 cursor-pointer rounded-xl border border-line bg-white p-1"
                />
              </Field>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
            <Field label="分类描述">
              <input
                name="description"
                maxLength={300}
                defaultValue={category.description ?? ""}
                placeholder="一句话描述"
                className={inputCls}
              />
            </Field>
            <Field label="跳转链接" hint="（留空则进入分类教程页）">
              <input
                name="linkUrl"
                maxLength={500}
                defaultValue={category.linkUrl ?? ""}
                placeholder="/站内路径 或 https://example.com"
                className={inputCls}
              />
            </Field>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <button
              type="submit"
              disabled={pending}
              className="h-10 rounded-full bg-ink px-5 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
            >
              {pending ? "保存中…" : "保存修改"}
            </button>
            <Message state={state} />
          </div>
        </form>
      </div>
    </div>
  );
}
