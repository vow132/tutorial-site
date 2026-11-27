"use client";

import { useActionState, useRef, useState, type RefObject } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import type { TutorialFormState } from "@/lib/actions/tutorials";
import { submitKeepingValues } from "@/lib/form-submit";
import CoverField from "./cover-field";
import TagInput from "./tag-input";
import { snapshot, useDraft, type DraftValues } from "./use-draft";
import MarkdownImport from "./markdown-import";
import type { ImportedTutorial } from "@/lib/markdown-import";
import PublishControl from "./publish-control";
import { useAdminI18n } from "@/lib/i18n/client";

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
type SeriesOption = { id: number; title: string };

type Initial = {
  title: string;
  slug: string;
  excerpt: string | null;
  content: string;
  categoryId: number;
  seriesId: number | null;
  published: boolean;
  publishAt: string | null;
  cover: string | null;
  tags: string[];
};

type Props = {
  categories: Category[];
  series: SeriesOption[];
  /** 「作者」下拉框的选项：只有编辑和站长有（lib/authors.ts），作者自己的表单是 null，不显示这个字段 */
  authors?: { id: number; label: string }[] | null;
  /** 当前作者（新建时是自己） */
  authorId?: number | null;
  /** 编辑器里显示「图片库」按钮（有图片库权限时） */
  mediaLibrary?: boolean;
  /** 已有标签（按使用次数排序），输入时给出建议 */
  tagSuggestions: string[];
  action: (prev: TutorialFormState, formData: FormData) => Promise<TutorialFormState>;
  initial?: Initial;
};

const inputCls =
  "h-11 w-full rounded-xl border border-line bg-surface px-4 text-sm outline-none transition-colors focus:border-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent/60";

/** 本地草稿 → 表单初始值 */
function fromDraft(values: DraftValues): Initial {
  return {
    title: values.title ?? "",
    slug: values.slug ?? "",
    excerpt: values.excerpt || null,
    content: values.content ?? "",
    categoryId: Number(values.categoryId) || 0,
    seriesId: Number(values.seriesId) || null,
    published: values.published === "on",
    publishAt: values.publishAt || null,
    cover: values.cover || null,
    tags: `${values.tags ?? ""},${values.tagsPending ?? ""}`.split(",").map((tag) => tag.trim()).filter(Boolean),
  };
}

/** 表单初始值 → 和自动保存快照相同格式的字段（用来判断有没有改动）。 */
function toDraft(initial: Initial | undefined): DraftValues {
  const published = initial?.published ?? true;
  const publishAt = initial?.publishAt ?? null;
  return {
    title: initial?.title ?? "",
    slug: initial?.slug ?? "",
    excerpt: initial?.excerpt ?? "",
    categoryId: initial?.categoryId ? String(initial.categoryId) : "",
    seriesId: initial?.seriesId ? String(initial.seriesId) : "",
    tags: initial?.tags.join(",") ?? "",
    tagsPending: "",
    cover: initial?.cover ?? "",
    content: initial?.content ?? "",
    published: !publishAt && published ? "on" : "",
    publishAt: publishAt ? new Date(publishAt).toISOString() : "",
  };
}

function useAgo() {
  const { m, plural } = useAdminI18n();
  const t = m.admin.tutorials;
  return (iso: string) => {
    const minutes = Math.round((Date.now() - Date.parse(iso)) / 60000);
    if (minutes < 1) return t.justNow;
    if (minutes < 60) return plural(minutes, t.minutesAgo);
    const hours = Math.round(minutes / 60);
    return hours < 48 ? plural(hours, t.hoursAgo) : plural(Math.round(hours / 24), t.daysAgo);
  };
}

/**
 * 教程编辑表单 + 本地草稿：draftKey 区分新建（"new"）和各篇教程（id）。
 * 恢复草稿时用草稿内容重新挂载整个表单（编辑器、标签、封面都从初始值读取）。
 */
export default function TutorialForm({
  draftKey,
  serverUpdatedAt,
  initial,
  ...props
}: Props & { draftKey: string; serverUpdatedAt?: string }) {
  const formRef = useRef<HTMLFormElement>(null);
  const draft = useDraft(formRef, draftKey, toDraft(initial), serverUpdatedAt);
  const [restored, setRestored] = useState<Initial | null>(null);
  const [version, setVersion] = useState(0);
  const { m, f } = useAdminI18n();
  const t = m.admin.tutorials;
  const ago = useAgo();

  /** 导入 Markdown：在表单当前的值（含没保存的修改，如已选的分类）上替换正文和文件里给出的字段。 */
  const applyImport = (imported: ImportedTutorial) => {
    const current = formRef.current ? fromDraft(snapshot(formRef.current)) : (restored ?? initial);
    setRestored({
      ...(current ?? fromDraft({})),
      title: imported.title || current?.title || "",
      slug: imported.slug || current?.slug || "",
      excerpt: imported.excerpt || current?.excerpt || null,
      tags: imported.tags.length ? imported.tags : (current?.tags ?? []),
      content: imported.content,
    });
    setVersion((value) => value + 1);
  };
  const hasContent = () => {
    const values = formRef.current ? snapshot(formRef.current) : null;
    return Boolean(values && values.content.replace(/<[^>]*>/g, "").trim());
  };

  return (
    <>
      {draft.pending && (
        <div
          role="alert"
          className="mb-5 flex flex-wrap items-center gap-3 rounded-2xl border border-amber-500/30 bg-amber-500/10 px-5 py-3 text-sm text-amber-800 dark:text-amber-200"
        >
          <span className="flex-1">
            {f(initial ? t.draftFound : t.draftFoundNew, { ago: ago(draft.pending.savedAt) })}
          </span>
          <button
            type="button"
            onClick={() => {
              const values = draft.restore();
              if (values) {
                setRestored(fromDraft(values));
                setVersion((value) => value + 1);
              }
            }}
            className="h-9 rounded-lg bg-btn px-4 text-xs font-semibold text-white"
          >
            {t.restoreDraft}
          </button>
          <button
            type="button"
            onClick={draft.discard}
            className="h-9 rounded-lg border border-amber-500/40 px-4 text-xs font-medium"
          >
            {t.discardDraft}
          </button>
        </div>
      )}
      <MarkdownImport onImport={applyImport} hasContent={hasContent} />
      <TutorialFields
        key={version}
        {...props}
        initial={restored ?? initial}
        formRef={formRef}
        savedAt={draft.savedAt}
      />
    </>
  );
}

function TutorialFields({
  categories,
  series,
  authors,
  authorId,
  mediaLibrary = false,
  tagSuggestions,
  action,
  initial,
  formRef,
  savedAt,
}: Props & { formRef: RefObject<HTMLFormElement | null>; savedAt: string | null }) {
  const [state, formAction, pending] = useActionState<TutorialFormState, FormData>(
    action,
    {}
  );
  const { m, f, date } = useAdminI18n();
  const t = m.admin.tutorials;

  return (
    // 不用 action={formAction}：保存失败（如 Slug 重复）时 React 会重置表单，
    // 标题、Slug、摘要会被清空。成功后服务端会跳转，所以无需重置。
    <form ref={formRef} onSubmit={submitKeepingValues(formAction)} className="space-y-5">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div className="md:col-span-2">
          <label className="mb-1.5 block text-sm font-medium text-ink-2">
            {t.title} <span className="text-red-400">*</span>
          </label>
          <input
            name="title"
            required
            defaultValue={initial?.title}
            placeholder={t.titlePlaceholder}
            className={inputCls}
          />
        </div>

        <div>
          <label className="mb-1.5 block text-sm font-medium text-ink-2">
            {t.slug}
          </label>
          <input
            name="slug"
            defaultValue={initial?.slug}
            placeholder={t.slugPlaceholder}
            className={inputCls}
          />
        </div>

        <div>
          <label className="mb-1.5 block text-sm font-medium text-ink-2">
            {t.category} <span className="text-red-400">*</span>
          </label>
          <select
            name="categoryId"
            required
            defaultValue={initial?.categoryId || ""}
            className={inputCls}
          >
            <option value="" disabled>
              {t.chooseCategory}
            </option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="tutorial-series" className="mb-1.5 block text-sm font-medium text-ink-2">
            {t.series}
            <Link href="/admin/series" className="ml-2 text-xs font-normal text-accent-ink hover:underline">
              {t.manageSeries}
            </Link>
          </label>
          <select id="tutorial-series" name="seriesId" defaultValue={initial?.seriesId ?? ""} className={inputCls}>
            <option value="">{t.noSeries}</option>
            {series.map((item) => (
              <option key={item.id} value={item.id}>
                {item.title}
              </option>
            ))}
          </select>
          <p className="mt-1 text-xs text-ink-3">{t.seriesHint}</p>
        </div>

        {authors && authors.length > 1 && (
          <div>
            <label htmlFor="tutorial-author" className="mb-1.5 block text-sm font-medium text-ink-2">
              {t.author}
            </label>
            <select id="tutorial-author" name="authorId" defaultValue={authorId ?? ""} className={inputCls}>
              {authors.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.label}
                </option>
              ))}
            </select>
            <p className="mt-1 text-xs text-ink-3">{t.authorHint}</p>
          </div>
        )}

        <div className="md:col-span-2">
          <label className="mb-1.5 block text-sm font-medium text-ink-2">
            {t.excerpt}
          </label>
          <textarea
            name="excerpt"
            rows={2}
            defaultValue={initial?.excerpt ?? ""}
            placeholder={t.excerptPlaceholder}
            className="w-full rounded-xl border border-line bg-surface px-4 py-3 text-sm outline-none transition-colors focus:border-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent/60"
          />
        </div>
      </div>

      <TagInput initial={initial?.tags ?? []} suggestions={tagSuggestions} />

      <CoverField initial={initial?.cover ?? null} />

      <div>
        <label className="mb-1.5 block text-sm font-medium text-ink-2">
          {t.content} <span className="text-red-400">*</span>
          <span className="ml-2 text-xs font-normal text-ink-3">{t.contentHint}</span>
        </label>
        <RichTextEditor name="content" initialContent={initial?.content ?? ""} mediaLibrary={mediaLibrary} />
      </div>

      {state.error && (
        <p className="rounded-xl bg-red-500/10 px-4 py-3 text-sm text-red-500 dark:text-red-400">
          {state.error}
        </p>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-line bg-surface px-5 py-4">
        <PublishControl published={initial?.published ?? true} publishAt={initial?.publishAt ?? null} />
        <div className="flex items-center gap-3">
          {savedAt && (
            <span className="hidden text-xs text-ink-3 sm:inline" aria-live="polite">
              {f(t.draftSaved, { time: date(savedAt, { hour: "2-digit", minute: "2-digit", timeZone: undefined }) })}
            </span>
          )}
          <Link
            href="/admin/tutorials"
            className="rounded-full px-5 py-2.5 text-sm font-medium text-ink-2 transition-colors hover:text-ink"
          >
            {m.admin.common.cancel}
          </Link>
          <button
            type="submit"
            disabled={pending}
            className="rounded-full bg-btn px-7 py-2.5 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {pending ? m.admin.common.saving : t.submit}
          </button>
        </div>
      </div>
    </form>
  );
}
