import { createHash } from "node:crypto";
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
const articleCache = new Map<string, Promise<ProcessedArticle>>();

function remember<K, V>(cache: Map<K, V>, key: K, value: V, max: number) {
  cache.delete(key);
  cache.set(key, value);
  if (cache.size <= max) return;
  const oldest = cache.keys().next().value as K | undefined;
  if (oldest !== undefined) cache.delete(oldest);
}

function decodeEntities(value: string) {
  return value
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&");
}

async function localImageSize(src: string): Promise<ImageDimension> {
  if (!src.startsWith("/uploads/")) return null;
  const cached = dimensionCache.get(src);
  if (cached) return cached;

  const task = imageSizeFromFile(
    path.join(process.cwd(), "public", src.replace(/^\/+/, "")),
  )
    .then((size) =>
      size.width && size.height
        ? { width: size.width, height: size.height }
        : null,
    )
    .catch(() => null);

  remember(dimensionCache, src, task, MAX_DIMENSION_CACHE);
  return task;
}

async function enhanceImageTag(tag: string) {
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
  if (!/\sloading=/.test(next)) {
    next = /\s\/>$/.test(next)
      ? next.replace(/\s\/>$/, ' loading="lazy" decoding="async" />')
      : next.replace(/>$/, ' loading="lazy" decoding="async">');
  }
  return next;
}

async function replaceAsync(
  input: string,
  expression: RegExp,
  replace: (match: string) => Promise<string>,
) {
  const matches = [...input.matchAll(expression)];
  if (matches.length === 0) return input;

  const replacements = await Promise.all(
    matches.map((match) => replace(match[0])),
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

async function processArticleUncached(html: string): Promise<ProcessedArticle> {
  const toc: TocItem[] = [];
  let headingIndex = 0;

  let output = html.replace(
    /<h([23])(?:\s[^>]*)?>([\s\S]*?)<\/h\1>/g,
    (_match, level: string, inner: string) => {
      const text = inner.replace(/<[^>]+>/g, "").trim();
      const id = `h-${headingIndex++}`;
      toc.push({ id, text, level: Number(level) });
      return `<h${level} id="${id}">${inner}</h${level}>`;
    },
  );

  output = output.replace(
    /<pre><code(?:\s+class="language-([\w-]+)")?>([\s\S]*?)<\/code><\/pre>/g,
    (match, language: string | undefined, code: string) => {
      const decoded = decodeEntities(code);
      try {
        const highlighted =
          language && hljs.getLanguage(language)
            ? hljs.highlight(decoded, { language }).value
            : hljs.highlightAuto(decoded).value;
        return `<pre><code class="hljs language-${language ?? "plaintext"}">${highlighted}</code></pre>`;
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

/** Strip HTML for excerpts and search results. */
export function stripHtml(html: string, max = 160): string {
  const text = html
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return text.length > max ? text.slice(0, max) + "…" : text;
}
