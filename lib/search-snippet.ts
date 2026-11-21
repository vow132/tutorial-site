import { stripHtml } from "@/lib/article";

/**
 * 搜索结果摘要：关键词在正文中间时，截取它前后一段，让读者看到为什么命中。
 * 纯函数，数据库部分在 lib/search.ts 的 refineSnippets()。
 */

/** 从正文中间截出来的 HTML 片段转纯文本：先去掉首尾被截断的半个标签。 */
export function htmlFragmentToText(fragment: string) {
  let html = fragment;
  const firstClose = html.indexOf(">");
  const firstOpen = html.indexOf("<");
  if (firstClose !== -1 && (firstOpen === -1 || firstClose < firstOpen)) html = html.slice(firstClose + 1);
  html = html.replace(/<[^>]*$/, "");
  return stripHtml(html, Number.MAX_SAFE_INTEGER);
}

/**
 * 以关键词为中心截一段：前面约 before 字、后面约 after 字。截断的一侧加省略号
 * （openStart/openEnd 表示这段文字本身就是从更长的正文里截出来的）。找不到关键词返回 null。
 */
export function snippetAround(
  text: string,
  keyword: string,
  { before = 40, after = 100, openStart = false, openEnd = false } = {},
) {
  const needle = keyword.trim().toLowerCase();
  if (!needle) return null;
  const index = text.toLowerCase().indexOf(needle);
  if (index === -1) return null;
  const start = Math.max(0, index - before);
  const end = Math.min(text.length, index + needle.length + after);
  const head = start > 0 || openStart ? "…" : "";
  const tail = end < text.length || openEnd ? "…" : "";
  return `${head}${text.slice(start, end).trim()}${tail}`;
}

/** 摘要里已经能看到关键词（不分大小写）就不用再换。 */
export function snippetShowsKeyword(snippet: string, keyword: string) {
  const needle = keyword.trim().toLowerCase();
  return Boolean(needle) && snippet.toLowerCase().includes(needle);
}
