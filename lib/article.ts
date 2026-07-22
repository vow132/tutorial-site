import hljs from "highlight.js";

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
    /<h([23])>([\s\S]*?)<\/h\1>/g,
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
