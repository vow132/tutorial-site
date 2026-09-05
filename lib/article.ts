import hljs from "highlight.js";
import { imageSize } from "image-size";
import { readFileSync } from "node:fs";
import path from "node:path";

export type TocItem = { id: string; text: string; level: number };

function decodeEntities(s: string) {
  return s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&");
}

/** 本地 /uploads 图片的尺寸缓存，避免同一文件反复读盘。 */
const dimensionCache = new Map<string, { width: number; height: number } | null>();

function localImageSize(src: string) {
  if (!src.startsWith("/uploads/")) return null;
  const cached = dimensionCache.get(src);
  if (cached !== undefined) return cached;
  let dim: { width: number; height: number } | null = null;
  try {
    const buf = readFileSync(path.join(process.cwd(), "public", src));
    const size = imageSize(buf);
    if (size.width && size.height) dim = { width: size.width, height: size.height };
  } catch {
    // 文件缺失或格式未知：保持原样，交由 CSS 兜底
  }
  dimensionCache.set(src, dim);
  return dim;
}

/** 给本地图补 width/height（防 CLS）与懒加载属性。 */
function enhanceImageTag(tag: string) {
  const src = /src="([^"]*)"/.exec(tag)?.[1];
  if (!src) return tag;
  let next = tag;
  const dim = localImageSize(src);
  if (dim && !/\swidth=/.test(next)) {
    next = next.replace(
      /<img/i,
      `<img width="${dim.width}" height="${dim.height}"`,
    );
  }
  if (!/\sloading=/.test(next)) {
    next = /\s\/>$/.test(next)
      ? next.replace(/\s\/>$/, ' loading="lazy" decoding="async" />')
      : next.replace(/>$/, ' loading="lazy" decoding="async">');
  }
  return next;
}

/**
 * 处理教程 HTML：
 * 1. 提取 h2/h3 生成目录并注入锚点 id
 * 2. 服务端 highlight.js 代码高亮
 */
export function processArticle(html: string): {
  html: string;
  toc: TocItem[];
} {
  const toc: TocItem[] = [];
  let i = 0;

  let out = html.replace(
    /<h([23])(?:\s[^>]*)?>([\s\S]*?)<\/h\1>/g,
    (_m, level: string, inner: string) => {
      const text = inner.replace(/<[^>]+>/g, "").trim();
      const id = `h-${i++}`;
      toc.push({ id, text, level: Number(level) });
      return `<h${level} id="${id}">${inner}</h${level}>`;
    }
  );

  out = out.replace(
    /<pre><code(?:\s+class="language-([\w-]+)")?>([\s\S]*?)<\/code><\/pre>/g,
    (m, lang: string | undefined, code: string) => {
      const decoded = decodeEntities(code);
      try {
        const highlighted =
          lang && hljs.getLanguage(lang)
            ? hljs.highlight(decoded, { language: lang }).value
            : hljs.highlightAuto(decoded).value;
        return `<pre><code class="hljs language-${lang ?? "plaintext"}">${highlighted}</code></pre>`;
      } catch {
        return m;
      }
    }
  );

  out = out.replace(/<img\b[^>]*>/g, enhanceImageTag);

  return { html: out, toc };
}

/** 去掉 HTML 标签，用于摘要/搜索结果 */
export function stripHtml(html: string, max = 160): string {
  const text = html
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return text.length > max ? text.slice(0, max) + "…" : text;
}
