/**
 * 教程系列的纯函数：表单校验、URL、系列内的位置（后台、前台、测试共用）。
 */
import { tagSlug } from "@/lib/tags";
import { format } from "@/lib/i18n/format";
import type { Messages } from "@/lib/i18n/messages/types";

type Text = Messages["admin"]["validation"];

export const MAX_SERIES_TITLE = 60;
export const MAX_SERIES_DESCRIPTION = 300;
/** 系列页至少有这么多篇已发布教程才允许搜索引擎收录。 */
export const MIN_INDEXABLE_SERIES_TUTORIALS = 2;

export const seriesPath = (slug: string) => `/series/${encodeURIComponent(slug)}`;

/** 校验后台填写的系列信息；别名留空时按标题生成（规则与标签相同：小写、保留中文）。 */
export function parseSeriesInput(input: { title: unknown; slug: unknown; description: unknown }, t: Text):
  | { data: { title: string; slug: string; description: string | null } }
  | { error: string } {
  const title = String(input.title ?? "").replace(/\s+/g, " ").trim();
  const description = String(input.description ?? "").trim();
  if (!title) return { error: t.seriesTitleRequired };
  if (Array.from(title).length > MAX_SERIES_TITLE) return { error: format(t.seriesTitleTooLong, { max: MAX_SERIES_TITLE }) };
  if (Array.from(description).length > MAX_SERIES_DESCRIPTION) return { error: format(t.seriesDescriptionTooLong, { max: MAX_SERIES_DESCRIPTION }) };
  const slug = tagSlug(String(input.slug ?? "").trim() || title);
  if (!slug) return { error: t.slugNoText };
  return { data: { title, slug, description: description || null } };
}

/** 某篇在系列里的位置，以及前后两篇（都只算已发布的）。不在系列里时返回 null。 */
export function seriesPosition<T extends { id: number }>(tutorials: T[], id: number) {
  const index = tutorials.findIndex((tutorial) => tutorial.id === id);
  if (index === -1) return null;
  return {
    number: index + 1,
    total: tutorials.length,
    prev: tutorials[index - 1] ?? null,
    next: tutorials[index + 1] ?? null,
  };
}

export const MAX_CHAPTER_TITLE = 30;

/** 后台填写的章节名：空表示不分章；最多 MAX_CHAPTER_TITLE 个字。 */
export function parseChapterInput(raw: unknown, t: Text): { value: string | null } | { error: string } {
  const value = String(raw ?? "").replace(/\s+/g, " ").trim();
  if (!value) return { value: null };
  if (Array.from(value).length > MAX_CHAPTER_TITLE) return { error: format(t.chapterTooLong, { max: MAX_CHAPTER_TITLE }) };
  return { value };
}

export type ChapterGroup<T> = { chapter: string | null; items: (T & { number: number })[] };

/**
 * 按章节分组（「教程书」目录）：顺序不变，相邻、章节名相同的归为一章；没填章节名的单独成组、不显示章节标题。
 * 编号贯穿整个系列（第 1、2、3… 篇），不按章重新编号。
 */
export function groupByChapter<T extends { seriesChapter?: string | null }>(tutorials: T[]): ChapterGroup<T>[] {
  const groups: ChapterGroup<T>[] = [];
  tutorials.forEach((tutorial, index) => {
    const chapter = tutorial.seriesChapter?.trim() || null;
    const last = groups.at(-1);
    if (last && last.chapter === chapter) last.items.push({ ...tutorial, number: index + 1 });
    else groups.push({ chapter, items: [{ ...tutorial, number: index + 1 }] });
  });
  return groups;
}

/** 系列里第一篇没读完的（都读完了返回 null）。 */
export function firstUnread<T extends { id: number }>(tutorials: T[], read: ReadonlySet<number>): T | null {
  return tutorials.find((tutorial) => !read.has(tutorial.id)) ?? null;
}
