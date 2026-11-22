import { Marked, type Token, type Tokens } from "marked";

/**
 * 把 Markdown 文件转成教程表单的字段（浏览器里按需加载，后台「从 Markdown 导入」用）。
 * - 开头的 front matter（--- 包起来的 key: value）里取 title / slug / excerpt(description) / tags；
 * - 没有 title 时用正文第一个「# 标题」，并从正文里去掉它；
 * - GitHub 风格的提示框 `> [!TIP]` / `[!WARNING]` / `[!CAUTION]` 转成编辑器的提示框；
 * - 编辑器只有二、三级标题：正文里最大的标题当作二级，更深的变成加粗段落。
 * 生成的 HTML 保存时还会在服务端按白名单过滤（lib/sanitize.ts）。
 */

export type ImportedTutorial = { title: string; slug: string; excerpt: string; tags: string[]; content: string };

type FrontMatter = Record<string, string | string[]>;

const unquote = (value: string) => value.trim().replace(/^(["'])(.*)\1$/, "$2").trim();

/** 极简 front matter：`key: value`、`key: [a, b]`，以及下一行起的 `- item` 列表。 */
export function parseFrontMatter(markdown: string): { data: FrontMatter; body: string } {
  const text = markdown.replace(/^﻿/, "").replace(/\r\n?/g, "\n");
  const match = /^---\n([\s\S]*?)\n---[ \t]*(?:\n|$)/.exec(text);
  if (!match) return { data: {}, body: text };
  const data: FrontMatter = {};
  let listKey: string | null = null;
  for (const line of match[1].split("\n")) {
    const item = /^\s*-\s+(.*)$/.exec(line);
    if (item && listKey) {
      const list = Array.isArray(data[listKey]) ? (data[listKey] as string[]) : [];
      list.push(unquote(item[1]));
      data[listKey] = list;
      continue;
    }
    const pair = /^([A-Za-z_][\w-]*)\s*:\s*(.*)$/.exec(line);
    if (!pair) continue;
    const key = pair[1].toLowerCase();
    const value = pair[2].trim();
    listKey = value ? null : key;
    if (!value) continue;
    data[key] = value.startsWith("[") && value.endsWith("]")
      ? value.slice(1, -1).split(",").map(unquote).filter(Boolean)
      : unquote(value);
  }
  return { data, body: text.slice(match[0].length) };
}

const CALLOUT_TYPES: Record<string, string> = { NOTE: "tip", TIP: "tip", IMPORTANT: "warning", WARNING: "warning", CAUTION: "danger" };

/** `> [!TIP]` 开头的引用块改写成 `<div data-callout>`（中间空行让 Markdown 照常解析）；跳过代码块里的内容。 */
export function convertCallouts(markdown: string): string {
  const lines = markdown.split("\n");
  const out: string[] = [];
  let fence: string | null = null;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const fenceMatch = /^\s*(`{3,}|~{3,})/.exec(line);
    if (fenceMatch) {
      if (!fence) fence = fenceMatch[1][0];
      else if (fenceMatch[1][0] === fence) fence = null;
      out.push(line);
      continue;
    }
    const start = !fence && /^>\s*\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\]\s*(.*)$/i.exec(line);
    if (!start) {
      out.push(line);
      continue;
    }
    const inner = start[2] ? [start[2]] : [];
    while (i + 1 < lines.length && /^>/.test(lines[i + 1])) inner.push(lines[++i].replace(/^>\s?/, ""));
    out.push(`<div data-callout="${CALLOUT_TYPES[start[1].toUpperCase()]}">`, "", ...inner, "", "</div>");
  }
  return out.join("\n");
}

const escapeHtml = (text: string) =>
  text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const field = (data: FrontMatter, ...keys: string[]) => {
  for (const key of keys) {
    const value = data[key];
    if (typeof value === "string" && value) return value;
  }
  return "";
};

export function markdownToTutorial(markdown: string): ImportedTutorial {
  const { data, body: rawBody } = parseFrontMatter(markdown);
  let body = rawBody;
  let title = field(data, "title");
  if (!title) {
    // 第一个非空行是「# 标题」时拿来当标题
    const heading = /^\s*#\s+(.+?)\s*#*\s*$/m.exec(body);
    if (heading && body.slice(0, heading.index).trim() === "") {
      title = heading[1];
      body = body.slice(heading.index + heading[0].length);
    }
  }
  const tagsValue = data.tags ?? data.keywords ?? [];
  const tags = (Array.isArray(tagsValue) ? tagsValue : tagsValue.split(/[,，、]/)).map((tag) => tag.trim()).filter(Boolean);

  const marked = new Marked({ gfm: true });
  const tokens = marked.lexer(convertCallouts(body));
  let minDepth = 6;
  marked.walkTokens(tokens, (token: Token) => {
    if (token.type === "heading") minDepth = Math.min(minDepth, (token as Tokens.Heading).depth);
  });
  const shift = 2 - Math.min(minDepth, 2);
  marked.use({
    renderer: {
      heading(token: Tokens.Heading) {
        const text = this.parser.parseInline(token.tokens);
        const level = token.depth + shift;
        return level <= 3 ? `<h${level}>${text}</h${level}>\n` : `<p><strong>${text}</strong></p>\n`;
      },
      // 默认渲染会在代码末尾多一个换行，编辑器里会显示成多出来的空行
      code(token: Tokens.Code) {
        const lang = /^[\w+#.-]+/.exec(token.lang ?? "")?.[0];
        return `<pre><code${lang ? ` class="language-${escapeHtml(lang.toLowerCase())}"` : ""}>${escapeHtml(token.text)}</code></pre>\n`;
      },
    },
  });
  const content = marked.parser(tokens).trim();

  return {
    title: title.trim().slice(0, 200),
    slug: field(data, "slug"),
    excerpt: field(data, "excerpt", "description", "summary").slice(0, 500),
    tags,
    content,
  };
}
