import { markdownToTutorial, parseFrontMatter } from "@/lib/markdown-import";

/**
 * 批量迁移导入（后台「批量导入」）：把 Markdown 文件夹（Hexo / Hugo / Jekyll / Obsidian / VuePress 等）
 * 或 WordPress 导出文件转成统一的「待导入文章」。纯函数，在浏览器里运行（解析库按需加载），也方便单元测试。
 * 生成的 HTML 在服务端保存时还会按白名单过滤（lib/sanitize.ts）。
 */

export type ImportCandidate = {
  /** 稳定标识：文件路径或 WordPress 文章 ID */
  key: string;
  /** 给人看的来源：文件路径或「WordPress #123」 */
  source: string;
  title: string;
  /** 想用的网址别名，服务端还会规整，重复时自动加 -2、-3 */
  slug: string;
  excerpt: string;
  content: string;
  tags: string[];
  /** 原来的分类名，和本站分类同名时可以自动对应 */
  categories: string[];
  /** 原来是否已发布 */
  published: boolean;
  createdAt: string | null;
  updatedAt: string | null;
  /** 原来的访问路径（用来生成 301 跳转规则），不知道时为 null */
  oldPath: string | null;
  /** 正文里引用的图片地址 */
  images: string[];
};

export type ImportScan = { items: ImportCandidate[]; skipped: string[] };

/* ---------------- 通用 HTML 处理 ---------------- */

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };

export function decodeEntities(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (match, code: string) => {
    if (code[0] === "#") {
      const point = code[1].toLowerCase() === "x" ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10);
      return Number.isFinite(point) && point > 0 && point < 0x110000 ? String.fromCodePoint(point) : match;
    }
    return ENTITIES[code.toLowerCase()] ?? match;
  });
}

/** 去掉标签后的纯文本（合并空白）。 */
export function htmlToText(html: string): string {
  return decodeEntities(
    html
      .replace(/<(script|style)\b[\s\S]*?<\/\1>/gi, " ")
      .replace(/<pre\b[\s\S]*?<\/pre>/gi, " ")
      .replace(/<[^>]+>/g, " "),
  )
    .replace(/\s+/g, " ")
    .trim();
}

/** 没有摘要时取正文开头一段。 */
export function autoExcerpt(html: string, max = 150): string {
  const text = htmlToText(html);
  const chars = Array.from(text);
  return chars.length <= max ? text : `${chars.slice(0, max).join("").trimEnd()}…`;
}

/** 编辑器只有二、三级标题：最大的标题当二级，更深的变成加粗段落（和单篇 Markdown 导入一致）。 */
export function normalizeHeadings(html: string): string {
  const levels = Array.from(html.matchAll(/<h([1-6])\b/gi), (match) => Number(match[1]));
  if (levels.length === 0) return html;
  const shift = 2 - Math.min(...levels, 2);
  return html.replace(/<h([1-6])\b[^>]*>([\s\S]*?)<\/h\1>/gi, (_match, level: string, inner: string) => {
    const target = Number(level) + shift;
    return target <= 3 ? `<h${target}>${inner}</h${target}>` : `<p><strong>${inner}</strong></p>`;
  });
}

const IMG_SRC = /<img\b[^>]*?\bsrc\s*=\s*(?:"([^"]*)"|'([^']*)')/gi;

/** 正文里的图片地址（去重，按出现顺序）。 */
export function extractImageSources(html: string): string[] {
  const found = new Set<string>();
  for (const match of html.matchAll(IMG_SRC)) {
    const src = decodeEntities((match[1] ?? match[2] ?? "").trim());
    if (src) found.add(src);
  }
  return [...found];
}

const escapeAttribute = (value: string) => value.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");

/**
 * 按 map 替换图片地址；同时去掉原来的 srcset / sizes（指向旧网站的各尺寸小图，本站渲染时会自己生成）。
 */
export function replaceImageSources(html: string, map: Map<string, string>): string {
  return html.replace(/<img\b[^>]*>/gi, (tag) => {
    const cleaned = tag.replace(/\s(?:srcset|sizes)\s*=\s*(?:"[^"]*"|'[^']*')/gi, "");
    return cleaned.replace(/\bsrc\s*=\s*(?:"([^"]*)"|'([^']*)')/i, (whole, double?: string, single?: string) => {
      const src = decodeEntities((double ?? single ?? "").trim());
      const next = map.get(src);
      return next ? `src="${escapeAttribute(next)}"` : whole;
    });
  });
}

/* ---------------- 日期与网址 ---------------- */

/**
 * 解析 front matter / WordPress 里的时间。不带时区的（Hexo 的「2023-01-05 12:30:00」、WordPress 的本地时间）按北京时间算。
 * 解析不了返回 null。
 */
export function parseDate(value: string | undefined | null): string | null {
  if (!value) return null;
  const text = value.trim().replace(/^["']|["']$/g, "");
  if (!text || text.startsWith("0000-00-00")) return null;
  const naive = /^(\d{4})-(\d{1,2})-(\d{1,2})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?$/.exec(text);
  const date = naive
    ? new Date(
        `${naive[1]}-${naive[2].padStart(2, "0")}-${naive[3].padStart(2, "0")}T${(naive[4] ?? "00").padStart(2, "0")}:${naive[5] ?? "00"}:${naive[6] ?? "00"}+08:00`,
      )
    : new Date(text);
  const time = date.getTime();
  // 1990 年以前、明天以后的都当作写错了
  if (!Number.isFinite(time) || time < Date.UTC(1990, 0, 1) || time > Date.now() + 86_400_000) return null;
  return date.toISOString();
}

/** 只留路径（用来生成跳转规则）；不是本站路径或带查询参数的返回 null。 */
export function pathOf(url: string | undefined | null): string | null {
  if (!url) return null;
  try {
    const parsed = new URL(url, "https://placeholder.invalid");
    if (parsed.search) return null;
    const path = decodeURI(parsed.pathname);
    return path === "/" ? null : path;
  } catch {
    return null;
  }
}

/* ---------------- Markdown 文件夹 ---------------- */

const SKIPPED_DIRS = new Set(["node_modules", ".git", ".github", ".obsidian", ".trash", ".vuepress", "public", "themes", "resources", "dist", "build"]);
const MARKDOWN_FILE = /\.(?:md|markdown)$/i;
const IMAGE_FILE = /\.(?:png|jpe?g|gif|webp)$/i;

/** 文件夹里要导入的 Markdown 文件：跳过依赖、生成目录、主题和 Hugo 的栏目页 _index.md。 */
export function isImportableMarkdown(path: string): boolean {
  const parts = path.split("/").filter(Boolean);
  const name = parts.at(-1) ?? "";
  if (!MARKDOWN_FILE.test(name) || name.toLowerCase() === "_index.md") return false;
  return !parts.slice(0, -1).some((dir) => SKIPPED_DIRS.has(dir.toLowerCase()));
}

export const isImageFile = (path: string) => IMAGE_FILE.test(path);

type FrontMatter = Record<string, string | string[]>;

/** Hugo 的 TOML front matter（+++ 包起来）转成 YAML 写法，交给 parseFrontMatter。 */
export function tomlFrontMatterToYaml(markdown: string): string {
  const text = markdown.replace(/^﻿/, "").replace(/\r\n?/g, "\n");
  const match = /^\+\+\+\n([\s\S]*?)\n\+\+\+[ \t]*(?:\n|$)/.exec(text);
  if (!match) return markdown;
  const lines: string[] = [];
  for (const line of match[1].split("\n")) {
    const pair = /^([A-Za-z_][\w-]*)\s*=\s*(.+)$/.exec(line.trim());
    if (pair) lines.push(`${pair[1]}: ${pair[2].trim()}`);
  }
  return `---\n${lines.join("\n")}\n---\n${text.slice(match[0].length)}`;
}

const listOf = (value: string | string[] | undefined): string[] => {
  if (!value) return [];
  // Hexo 的多级分类写成 [[前端, CSS]] 或「- [前端, CSS]」：拍平成一个个名字
  return (Array.isArray(value) ? value : [value])
    .flatMap((item) => item.split(/[,，、]/))
    .map((item) => item.replace(/^[[\s"']+|[\]\s"']+$/g, "").trim())
    .filter(Boolean);
};

const first = (data: FrontMatter, ...keys: string[]) => {
  for (const key of keys) {
    const value = data[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return "";
};

/** Obsidian 的 ![[图片.png|说明]] 和 [[笔记]] 双链转成普通 Markdown。 */
export function convertWikiLinks(markdown: string): string {
  return markdown
    .replace(/!\[\[([^\]|]+?)(?:\|([^\]]*))?\]\]/g, (_m, target: string, alt?: string) => `![${alt ?? ""}](<${target.trim()}>)`)
    .replace(/(?<!!)\[\[([^\]|]+?)(?:\|([^\]]*))?\]\]/g, (_m, target: string, label?: string) => (label ?? target).trim());
}

/**
 * 一个 Markdown 文件 → 待导入文章。
 * - 标题：front matter 的 title，否则正文第一个「# 标题」，再否则文件名；
 * - 网址别名：front matter 的 slug，否则文件名（去掉 Jekyll 的日期前缀；Hugo 的 index.md 用所在目录名）；
 * - 日期：date，否则 Jekyll 文件名里的日期，否则文件修改时间；更新时间取 updated / lastmod；
 * - draft: true、published: false、放在 _drafts 目录里的算草稿；
 * - Hexo 的 <!-- more --> 之前的内容当摘要。
 */
export function markdownFileToCandidate(path: string, markdown: string, lastModified?: number): ImportCandidate {
  const prepared = convertWikiLinks(tomlFrontMatterToYaml(markdown));
  const { data, body } = parseFrontMatter(prepared);
  const more = /^([\s\S]*?)\n\s*<!--\s*more\s*-->\s*(?:\n|$)/i.exec(body);
  const tutorial = markdownToTutorial(prepared.replace(/\n\s*<!--\s*more\s*-->\s*(?=\n|$)/i, "\n"));

  const parts = path.split("/").filter(Boolean);
  const fileName = parts.at(-1) ?? path;
  const stem = fileName.replace(MARKDOWN_FILE, "");
  const bundle = /^index$/i.test(stem) && parts.length > 1 ? parts.at(-2)! : stem;
  const jekyll = /^(\d{4}-\d{2}-\d{2})-(.+)$/.exec(bundle);
  const fileSlug = jekyll ? jekyll[2] : bundle;

  const content = normalizeHeadings(tutorial.content);
  const draft =
    /^(true|yes)$/i.test(first(data, "draft")) ||
    /^(false|no)$/i.test(first(data, "published")) ||
    parts.some((dir) => dir.toLowerCase() === "_drafts");
  const createdAt =
    parseDate(first(data, "date", "created", "pubdate", "publishdate")) ??
    (jekyll ? parseDate(jekyll[1]) : null) ??
    (lastModified ? new Date(lastModified).toISOString() : null);
  const moreExcerpt = more ? autoExcerpt(markdownToTutorial(more[1]).content, 300) : "";
  const permalink = first(data, "permalink", "url");

  return {
    key: path,
    source: path,
    title: tutorial.title || fileSlug,
    slug: tutorial.slug || fileSlug,
    excerpt: tutorial.excerpt || moreExcerpt || autoExcerpt(content),
    content,
    tags: tutorial.tags,
    categories: listOf(data.categories ?? data.category),
    published: !draft,
    createdAt,
    updatedAt: parseDate(first(data, "updated", "lastmod", "modified", "last_modified_at")) ?? createdAt,
    oldPath: permalink.startsWith("/") ? pathOf(permalink) : null,
    images: extractImageSources(content),
  };
}

/**
 * Markdown 里的本地图片地址 → 文件夹里的文件路径。
 * 依次尝试：相对当前文件、相对所选文件夹根目录、Hexo 的 source/ 和 Hugo 的 static/ 目录，最后按文件名在整个文件夹里找（只有一个同名文件时）。
 * 外链（http、https、//、data:）返回 null。
 */
export function resolveLocalImage(src: string, markdownPath: string, available: Set<string>): string | null {
  if (/^(?:[a-z][\w+.-]*:|\/\/)/i.test(src)) return null;
  let clean = src.split(/[?#]/)[0];
  try {
    clean = decodeURI(clean);
  } catch {
    /* 保留原样 */
  }
  const parts = markdownPath.split("/").filter(Boolean);
  const dir = parts.slice(0, -1);
  const root = parts[0] && parts.length > 1 ? [parts[0]] : [];
  const join = (base: string[], rel: string) => {
    const out = [...base];
    for (const piece of rel.split("/")) {
      if (!piece || piece === ".") continue;
      if (piece === "..") out.pop();
      else out.push(piece);
    }
    return out.join("/");
  };
  const candidates = clean.startsWith("/")
    ? [join(root, clean), join([...root, "source"], clean), join([...root, "static"], clean), join([...root, "public"], clean)]
    : [join(dir, clean), join(dir, `assets/${clean}`), join(root, clean)];
  for (const candidate of candidates) if (available.has(candidate)) return candidate;
  const name = clean.split("/").pop()?.toLowerCase();
  if (!name) return null;
  const sameName = [...available].filter((path) => path.split("/").pop()?.toLowerCase() === name);
  return sameName.length === 1 ? sameName[0] : null;
}

/* ---------------- WordPress 导出文件（WXR） ---------------- */

/**
 * 解析 WordPress「工具 → 导出」得到的 XML。只取文章（post），跳过页面、附件、回收站和自动草稿。
 * 先把 CDATA 换成占位符再找标签，正文里出现的 </item> 之类不会把结构打乱。
 */
/** 跳过的页面、没有标题的文章怎么称呼（后台语言：m.admin.bulkImport 里的 skippedPage / untitled） */
export type WordPressLabels = { skippedPage: string; untitled: string };

export function parseWordPressExport(
  xml: string,
  labels: WordPressLabels = { skippedPage: "页面「{title}」", untitled: "未命名文章 {id}" },
): ImportScan & { siteUrl: string } {
  const cdata: string[] = [];
  const text = xml.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, (_m, inner: string) => `\u0000${cdata.push(inner) - 1}\u0000`);
  const restore = (value: string) => value.replace(/\u0000(\d+)\u0000/g, (_m, index: string) => cdata[Number(index)]);
  const valueOf = (block: string, tag: string) => {
    const match = new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</${tag}>`).exec(block);
    if (!match) return "";
    const raw = match[1];
    // CDATA 里是原文；不在 CDATA 里的按 XML 转义解码
    return /^\s*\u0000\d+\u0000\s*$/.test(raw) ? restore(raw.trim()) : decodeEntities(restore(raw)).trim();
  };

  const channel = text.split(/<item>/)[0];
  const siteUrl = valueOf(channel, "link") || valueOf(channel, "wp:base_site_url");
  const items: ImportCandidate[] = [];
  const skipped: string[] = [];

  for (const match of text.matchAll(/<item>([\s\S]*?)<\/item>/g)) {
    const block = match[1];
    const type = valueOf(block, "wp:post_type");
    const status = valueOf(block, "wp:status");
    const id = valueOf(block, "wp:post_id");
    const title = valueOf(block, "title").trim();
    if (type !== "post") {
      if (type === "page") skipped.push(labels.skippedPage.replace("{title}", title || id));
      continue;
    }
    if (!["publish", "draft", "pending", "private", "future"].includes(status)) continue;

    const terms = (domain: string) =>
      Array.from(block.matchAll(new RegExp(`<category\\s+domain="${domain}"[^>]*>([\\s\\S]*?)</category>`, "g")), (term) => {
        const raw = term[1].trim();
        return (/^\u0000\d+\u0000$/.test(raw) ? restore(raw) : decodeEntities(raw)).trim();
      }).filter(Boolean);

    const content = wordpressContentToHtml(valueOf(block, "content:encoded"));
    let slug = valueOf(block, "wp:post_name");
    try {
      slug = decodeURIComponent(slug);
    } catch {
      /* 保留原样 */
    }
    const createdAt = parseDate(gmt(valueOf(block, "wp:post_date_gmt"))) ?? parseDate(valueOf(block, "wp:post_date"));
    const excerpt = htmlToText(valueOf(block, "excerpt:encoded"));
    items.push({
      key: `wp-${id}`,
      source: `WordPress #${id}`,
      title: title || labels.untitled.replace("{id}", id),
      slug,
      excerpt: excerpt ? Array.from(excerpt).slice(0, 500).join("") : autoExcerpt(content),
      content,
      tags: [...new Set(terms("post_tag"))],
      categories: [...new Set(terms("category"))].filter((name) => name !== "Uncategorized" && name !== "未分类"),
      published: status === "publish",
      createdAt,
      updatedAt: parseDate(gmt(valueOf(block, "wp:post_modified_gmt"))) ?? createdAt,
      oldPath: pathOf(valueOf(block, "link")),
      images: extractImageSources(content),
    });
  }
  return { siteUrl, items, skipped };
}

/** WordPress 的 GMT 时间不带时区标记，补上 Z。 */
const gmt = (value: string) => (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(value) ? `${value.replace(" ", "T")}Z` : value);

const BLOCK_TAG = /^<(?:p|div|h[1-6]|ul|ol|li|pre|blockquote|table|figure|hr|img|iframe|dl|section)\b/i;

/**
 * WordPress 正文 → 编辑器能用的 HTML：
 * - 去掉区块编辑器的注释；
 * - 常见短代码：[caption] 保留图片和说明，[code lang="js"] 转代码块，其余短代码去掉方括号标记；
 * - 链接到原图的图片只保留图片本身（原图在旧网站上）；
 * - 经典编辑器的文章没有 <p>：按空行分段（WordPress 的 wpautop 规则的简化版）。
 */
export function wordpressContentToHtml(raw: string): string {
  let html = raw.replace(/<!--\s*\/?wp:[\s\S]*?-->/g, "").replace(/\r\n?/g, "\n");
  html = html.replace(/\[(code|sourcecode)([^\]]*)\]([\s\S]*?)\[\/\1\]/gi, (_m, _tag, attrs: string, code: string) => {
    const lang = /(?:lang|language)\s*=\s*["']?([\w+#-]+)/i.exec(attrs)?.[1];
    const escaped = decodeEntities(code.replace(/^\n+|\n+$/g, "")).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    return `\n\n<pre><code${lang ? ` class="language-${lang.toLowerCase()}"` : ""}>${escaped}</code></pre>\n\n`;
  });
  html = html.replace(/\[caption[^\]]*\]([\s\S]*?)\[\/caption\]/gi, (_m, inner: string) => {
    const image = /<a\b[^>]*>\s*<img\b[^>]*>\s*<\/a>|<img\b[^>]*>/i.exec(inner)?.[0] ?? "";
    const caption = inner.replace(image, "").trim();
    return `\n\n${image}${caption ? `\n\n<p>${caption}</p>` : ""}\n\n`;
  });
  html = html.replace(/<a\b[^>]*\bhref\s*=\s*["'][^"']+\.(?:jpe?g|png|gif|webp)(?:\?[^"']*)?["'][^>]*>\s*(<img\b[^>]*>)\s*<\/a>/gi, "$1");
  // 其余短代码：[gallery ids="1,2"]、[/xxx] 之类直接去掉（只认 WordPress 的写法：字母开头、没有空格的名字）
  html = html.replace(/\[\/?[a-z][\w-]*(?:\s[^\]]*)?\]/gi, (shortcode) => (/^\[(?:\/)?(?:https?|mailto):/i.test(shortcode) ? shortcode : ""));

  const autop = !/<p\b/i.test(html);
  if (autop) {
    html = html
      .split(/\n\s*\n/)
      .map((chunk) => chunk.trim())
      .filter(Boolean)
      .map((chunk) => (BLOCK_TAG.test(chunk) ? chunk : `<p>${chunk.replace(/\n/g, "<br>")}</p>`))
      .join("\n");
  }
  return normalizeHeadings(html.trim());
}

/* ---------------- 旧地址跳转 ---------------- */

/**
 * 旧网址 → 新网址的 Nginx 跳转规则（站点沿用原来的域名时放进 server 块，旧链接 301 到新地址，搜索引擎的收录不会断）。
 * 末尾带不带 / 的两种写法都会跳；地址里有引号、控制字符或和新地址相同的跳过。
 */
export function nginxRedirectRules(pairs: Array<{ oldPath: string | null; slug: string }>): string {
  const lines: string[] = [];
  const seen = new Set<string>();
  for (const { oldPath, slug } of pairs) {
    if (!oldPath || /["\\\u0000-\u001f]/.test(oldPath)) continue;
    const target = `/tutorials/${encodeURIComponent(slug)}`;
    const base = oldPath.replace(/\/+$/, "");
    if (!base || base === target || decodeURI(target) === base) continue;
    for (const path of [base, `${base}/`]) {
      if (seen.has(path)) continue;
      seen.add(path);
      lines.push(`location = "${path}" { return 301 ${target}; }`);
    }
  }
  return lines.join("\n");
}
