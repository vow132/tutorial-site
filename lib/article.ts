import { createHash } from "node:crypto";
import { stat } from "node:fs/promises";
import path from "node:path";
import hljs from "highlight.js/lib/core";
import bash from "highlight.js/lib/languages/bash";
import c from "highlight.js/lib/languages/c";
import cpp from "highlight.js/lib/languages/cpp";
import csharp from "highlight.js/lib/languages/csharp";
import css from "highlight.js/lib/languages/css";
import dockerfile from "highlight.js/lib/languages/dockerfile";
import dart from "highlight.js/lib/languages/dart";
import go from "highlight.js/lib/languages/go";
import graphql from "highlight.js/lib/languages/graphql";
import http from "highlight.js/lib/languages/http";
import ini from "highlight.js/lib/languages/ini";
import java from "highlight.js/lib/languages/java";
import javascript from "highlight.js/lib/languages/javascript";
import json from "highlight.js/lib/languages/json";
import kotlin from "highlight.js/lib/languages/kotlin";
import less from "highlight.js/lib/languages/less";
import markdown from "highlight.js/lib/languages/markdown";
import nginx from "highlight.js/lib/languages/nginx";
import objectivec from "highlight.js/lib/languages/objectivec";
import php from "highlight.js/lib/languages/php";
import plaintext from "highlight.js/lib/languages/plaintext";
import powershell from "highlight.js/lib/languages/powershell";
import python from "highlight.js/lib/languages/python";
import ruby from "highlight.js/lib/languages/ruby";
import rust from "highlight.js/lib/languages/rust";
import scss from "highlight.js/lib/languages/scss";
import sql from "highlight.js/lib/languages/sql";
import swift from "highlight.js/lib/languages/swift";
import typescript from "highlight.js/lib/languages/typescript";
import xml from "highlight.js/lib/languages/xml";
import yaml from "highlight.js/lib/languages/yaml";
import { imageSizeFromFile } from "image-size/fromFile";
import { THUMBNAIL_WIDTH, VARIANT_WIDTHS, variantName } from "@/lib/image-variants";
import { sanitizeArticleHtml } from "@/lib/sanitize";

const languages = {
  bash,
  c,
  cpp,
  csharp,
  css,
  dockerfile,
  dart,
  go,
  graphql,
  http,
  ini,
  java,
  javascript,
  json,
  kotlin,
  less,
  markdown,
  nginx,
  objectivec,
  php,
  plaintext,
  powershell,
  python,
  ruby,
  rust,
  scss,
  sql,
  swift,
  typescript,
  xml,
  yaml,
};

for (const [name, language] of Object.entries(languages)) {
  hljs.registerLanguage(name, language);
}

export type TocItem = { id: string; text: string; level: number };

type ImageDimension = { width: number; height: number } | null;
type ProcessedArticle = { html: string; toc: TocItem[] };

const MAX_DIMENSION_CACHE = 500;
const MAX_ARTICLE_CACHE = 100;
const dimensionCache = new Map<string, Promise<ImageDimension>>();
const variantCache = new Map<string, Promise<number[]>>();
const articleCache = new Map<string, Promise<ProcessedArticle>>();

function remember<K, V>(cache: Map<K, V>, key: K, value: V, max: number) {
  cache.delete(key);
  cache.set(key, value);
  if (cache.size <= max) return;
  const oldest = cache.keys().next().value as K | undefined;
  if (oldest !== undefined) cache.delete(oldest);
}

/** 超出 Unicode 范围的数字实体（如 &#99999999;）原样保留，避免 fromCodePoint 抛错。 */
function fromCodePoint(match: string, codePoint: number) {
  return codePoint > 0 && codePoint <= 0x10ffff ? String.fromCodePoint(codePoint) : match;
}

function decodeEntities(value: string) {
  return value
    .replace(/&#(\d+);/g, (match, code: string) => fromCodePoint(match, Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (match, code: string) => fromCodePoint(match, parseInt(code, 16)))
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&");
}

const UPLOADS_DIR = path.join(process.cwd(), "public", "uploads");

/** 只认 uploads 目录下的直接文件名，`/uploads/../../.env` 这类路径直接跳过。 */
function uploadName(src: string): string | null {
  const name = src.startsWith("/uploads/") ? src.slice("/uploads/".length) : "";
  return /^[\w-][\w.-]*$/.test(name) && name === path.basename(name) ? name : null;
}

async function localImageSize(src: string): Promise<ImageDimension> {
  const name = uploadName(src);
  if (!name) return null;
  const file = path.join(UPLOADS_DIR, name);
  const cached = dimensionCache.get(file);
  if (cached) return cached;

  const task = imageSizeFromFile(file)
    .then((size) =>
      size.width && size.height
        ? { width: size.width, height: size.height }
        : null,
    )
    .catch(() => null);

  remember(dimensionCache, file, task, MAX_DIMENSION_CACHE);
  return task;
}

/** 上传时生成的响应式小图（见 lib/upload-image.ts 的 createVariants）里实际存在的宽度。 */
function localVariants(name: string): Promise<number[]> {
  const cached = variantCache.get(name);
  if (cached) return cached;
  const task = Promise.all(
    VARIANT_WIDTHS.map((width) =>
      stat(path.join(UPLOADS_DIR, variantName(name, width))).then(
        (info) => (info.isFile() ? width : 0),
        () => 0,
      ),
    ),
  ).then((widths) => widths.filter((width) => width > 0));
  remember(variantCache, name, task, MAX_DIMENSION_CACHE);
  return task;
}

/** 本站上传图片的尺寸和 srcset（文章头图用）；不是本站上传的、或文件不存在时返回 null。 */
export async function uploadedImage(src: string) {
  const name = uploadName(src);
  const dimension = name ? await localImageSize(src) : null;
  if (!name || !dimension) return null;
  const widths = (await localVariants(name)).filter((width) => width < dimension.width);
  return {
    ...dimension,
    srcSet: widths.length
      ? [...widths.map((width) => `/uploads/${variantName(name, width)} ${width}w`), `${src} ${dimension.width}w`].join(", ")
      : undefined,
  };
}

/**
 * 列表卡片缩略图地址：优先 400w 小图，其次 800w，再次原图。只接受本站上传的图片，
 * 外链图片不做缩略图（可能很大、也可能失效）。
 */
export async function thumbnailFor(src: string | null | undefined): Promise<string | null> {
  const name = src ? uploadName(src) : null;
  if (!src || !name || !(await localImageSize(src))) return null;
  const widths = await localVariants(name);
  const best = [THUMBNAIL_WIDTH, 800].find((width) => widths.includes(width));
  return best ? `/uploads/${variantName(name, best)}` : src;
}

/**
 * 正文栏实际显示宽度：xl 约 820px，lg 为视口减去目录栏和边距，手机为视口减去两侧 16px。
 * 浏览器据此和屏幕像素比从 srcset 里挑最小够用的一张。
 */
const ARTICLE_IMAGE_SIZES =
  "(min-width: 1280px) 820px, (min-width: 1024px) calc(100vw - 302px), calc(100vw - 32px)";

/** 第一张图常常就是首屏主图，靠近正文开头时提高下载优先级。 */
const EARLY_IMAGE_OFFSET = 2000;

async function enhanceImageTag(tag: string, order: number, offset: number) {
  const src = /src="([^"]*)"/.exec(tag)?.[1];
  if (!src) return tag;

  let next = tag;
  const dimension = await localImageSize(src);
  if (dimension && !/\swidth=/.test(next)) {
    next = next.replace(
      /<img/i,
      `<img width="${dimension.width}" height="${dimension.height}"`,
    );
  }
  const name = uploadName(src);
  if (name && dimension && !/\ssrcset=/.test(next)) {
    const widths = (await localVariants(name)).filter((width) => width < dimension.width);
    if (widths.length > 0) {
      const srcset = [
        ...widths.map((width) => `/uploads/${variantName(name, width)} ${width}w`),
        `${src} ${dimension.width}w`,
      ].join(", ");
      next = next.replace(/<img/i, `<img srcset="${srcset}" sizes="${ARTICLE_IMAGE_SIZES}"`);
    }
  }
  if (!/\sloading=/.test(next)) {
    // 只有后面的图片延迟加载；第一张若也延迟，会拖慢首屏主图出现。
    const attributes =
      order === 0
        ? ` decoding="async"${offset < EARLY_IMAGE_OFFSET ? ' fetchpriority="high"' : ""}`
        : ' loading="lazy" decoding="async"';
    next = /\s\/>$/.test(next)
      ? next.replace(/\s\/>$/, `${attributes} />`)
      : next.replace(/>$/, `${attributes}>`);
  }
  return next;
}

async function replaceAsync(
  input: string,
  expression: RegExp,
  replace: (match: string, order: number, offset: number) => Promise<string>,
) {
  const matches = [...input.matchAll(expression)];
  if (matches.length === 0) return input;

  const replacements = await Promise.all(
    matches.map((match, order) => replace(match[0], order, match.index ?? 0)),
  );
  let cursor = 0;
  let output = "";

  matches.forEach((match, index) => {
    const start = match.index ?? cursor;
    output += input.slice(cursor, start) + replacements[index];
    cursor = start + match[0].length;
  });

  return output + input.slice(cursor);
}

/** 文章页上已经被占用的元素 ID，标题不能和它们重名。 */
const RESERVED_IDS = new Set(["main", "related-heading", "top"]);

/**
 * 标题 ID：按标题文字生成（保留中文），分享出去的章节链接不会因为前面插入了
 * 新标题而错位。标点和空白换成连字符；同一篇里重名时追加 -2、-3。
 */
export function headingSlug(text: string) {
  return text
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}_-]+/gu, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60)
    .replace(/-$/, "");
}

/** 代码块右上角显示的语言名。 */
const LANGUAGE_LABELS: Record<string, string> = {
  bash: "Shell", c: "C", cpp: "C++", csharp: "C#", css: "CSS", dart: "Dart",
  dockerfile: "Dockerfile", go: "Go", graphql: "GraphQL", http: "HTTP", ini: "INI",
  java: "Java", javascript: "JavaScript", json: "JSON", kotlin: "Kotlin", less: "Less",
  markdown: "Markdown", nginx: "Nginx", objectivec: "Objective-C", php: "PHP",
  powershell: "PowerShell", python: "Python", ruby: "Ruby", rust: "Rust", scss: "SCSS",
  sql: "SQL", swift: "Swift", typescript: "TypeScript", xml: "HTML", yaml: "YAML",
};

/** 代码块外壳：语言标签 + 复制按钮（按钮由 components/article-enhancer.tsx 接管）。 */
function codeBlock(language: string, highlighted: string) {
  const label = LANGUAGE_LABELS[language] ?? "代码";
  return (
    `<div class="code-block"><div class="code-head"><span class="code-lang">${label}</span>` +
    `<button type="button" class="code-copy" data-copy-code aria-label="复制代码">复制</button></div>` +
    `<pre><code class="hljs language-${language}">${highlighted}</code></pre></div>`
  );
}

async function processArticleUncached(html: string): Promise<ProcessedArticle> {
  const toc: TocItem[] = [];
  const usedIds = new Set(RESERVED_IDS);

  // 渲染前再过滤一次：覆盖本次加固之前就已入库的旧内容。
  let output = sanitizeArticleHtml(html).replace(
    /<h([23])(?:\s[^>]*)?>([\s\S]*?)<\/h\1>/g,
    (_match, level: string, inner: string) => {
      // 目录文字交给 React 渲染（会再转义一次），这里先还原 &amp; 等实体。
      const text = decodeEntities(inner.replace(/<[^>]+>/g, "")).trim();
      const base = headingSlug(text) || `section-${toc.length + 1}`;
      let id = base;
      for (let n = 2; usedIds.has(id); n++) id = `${base}-${n}`;
      usedIds.add(id);
      toc.push({ id, text, level: Number(level) });
      // 悬停时出现的 # 链接：点击复制本节地址（components/article-enhancer.tsx）。
      return `<h${level} id="${id}">${inner}<a class="heading-anchor" href="#${id}" aria-label="复制本节链接">#</a></h${level}>`;
    },
  );

  output = output.replace(
    /<pre><code(?:\s+class="language-([\w-]+)")?>([\s\S]*?)<\/code><\/pre>/g,
    (match, language: string | undefined, code: string) => {
      const decoded = decodeEntities(code);
      try {
        if (language && hljs.getLanguage(language)) {
          return codeBlock(language, hljs.highlight(decoded, { language }).value);
        }
        const auto = hljs.highlightAuto(decoded);
        return codeBlock(auto.language ?? "plaintext", auto.value);
      } catch {
        return match;
      }
    },
  );

  output = await replaceAsync(output, /<img\b[^>]*>/g, enhanceImageTag);
  return { html: output, toc };
}

/**
 * Highlighting and image probing are stable for a saved article, so keep a
 * small process-local LRU of promises. Concurrent requests also share work.
 */
export function processArticle(html: string): Promise<ProcessedArticle> {
  const key = createHash("sha256").update(html).digest("base64url");
  const cached = articleCache.get(key);
  if (cached) {
    remember(articleCache, key, cached, MAX_ARTICLE_CACHE);
    return cached;
  }

  const task = processArticleUncached(html).catch((error) => {
    articleCache.delete(key);
    throw error;
  });
  remember(articleCache, key, task, MAX_ARTICLE_CACHE);
  return task;
}

const BLOCK_TAG =
  /<\/?(?:p|div|h[1-6]|li|ul|ol|pre|blockquote|br|hr|table|thead|tbody|tr|td|th|figure|figcaption|img)\b[^>]*>/gi;

/**
 * Strip HTML for excerpts and search results. Entities are decoded because the
 * result is rendered as plain text (React / meta tags escape it again).
 */
export function stripHtml(html: string, max = 160): string {
  // 块级标签换成空格；行内标签（strong、a、code…）直接去掉，中文里不会多出空格。
  const text = decodeEntities(
    html.replace(BLOCK_TAG, " ").replace(/<[^>]+>/g, ""),
  )
    .replace(/\s+/g, " ")
    .trim();
  return text.length > max ? text.slice(0, max) + "…" : text;
}

/** 没写摘要时的 meta description：跳过代码块，取正文开头的文字。 */
export function htmlToDescription(html: string, max = 120): string {
  return stripHtml(html.replace(/<pre\b[\s\S]*?<\/pre>/gi, " "), max);
}

/** 正文里第一张本站上传的图片地址（跳过外链图片）。 */
export function firstUploadedImage(html: string): string | null {
  return /<img\b[^>]*\ssrc="(\/uploads\/[^"]+)"/i.exec(html)?.[1] ?? null;
}

export type ArticleImage = { url: string; alt?: string; width?: number; height?: number };

/** 正文第一张图，用作分享卡片和结构化数据的配图（只认站内路径和 http(s) 地址）。 */
export function firstArticleImage(html: string): ArticleImage | null {
  const tag = /<img\b[^>]*>/i.exec(html)?.[0];
  if (!tag) return null;
  const attr = (name: string) => {
    const value = new RegExp(`\\s${name}="([^"]*)"`, "i").exec(tag)?.[1];
    return value === undefined ? undefined : decodeEntities(value).trim();
  };
  const url = attr("src");
  if (!url || !/^(\/[^/]|https?:\/\/)/i.test(url)) return null;
  const width = Number(attr("width"));
  const height = Number(attr("height"));
  return {
    url,
    alt: attr("alt") || undefined,
    ...(width > 0 && height > 0 ? { width, height } : {}),
  };
}
