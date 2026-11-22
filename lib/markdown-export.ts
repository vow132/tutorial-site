import TurndownService from "turndown";

/**
 * 教程导出成 Markdown（后台「导出 Markdown」）：开头写 front matter，正文由 HTML 转换。
 * 和导入（lib/markdown-import.ts）对称：代码块带语言、表格转 GFM 表格、提示框转 `> [!TIP]`。
 * 本站的图片、链接（/uploads/…）写成绝对地址，文件拿到别处也能显示。
 */

export type ExportableTutorial = {
  title: string;
  slug: string;
  excerpt: string | null;
  tags: string[];
  content: string;
  createdAt: Date;
  updatedAt: Date;
};

const CALLOUT_MARKERS: Record<string, string> = { tip: "TIP", warning: "WARNING", danger: "CAUTION" };

/** front matter 的字符串值：有特殊字符时加双引号并转义。 */
function yamlString(value: string) {
  return /^[\p{L}\p{N} _.,()（）-]+$/u.test(value) && !/^\s|\s$/.test(value) ? value : JSON.stringify(value);
}

type DomNode = { nodeName: string; parentNode: DomNode | null; childNodes: ArrayLike<DomNode>; getAttribute?: (name: string) => string | null };

function isFirstRow(row: DomNode) {
  let table: DomNode | null = row.parentNode;
  while (table && table.nodeName !== "TABLE") table = table.parentNode;
  if (!table) return false;
  const find = (node: DomNode): DomNode | null => {
    for (const child of Array.from(node.childNodes)) {
      if (child.nodeName === "TR") return child;
      const nested = child.nodeName === "THEAD" || child.nodeName === "TBODY" ? find(child) : null;
      if (nested) return nested;
    }
    return null;
  };
  return find(table) === row;
}

function createService(siteUrl: string) {
  const service = new TurndownService({
    headingStyle: "atx",
    codeBlockStyle: "fenced",
    bulletListMarker: "-",
    emDelimiter: "*",
    hr: "---",
  });
  const absolute = (url: string) => (url.startsWith("/") && !url.startsWith("//") ? `${siteUrl}${url}` : url);

  // Markdown 没有下划线、高亮、上下标：保留成 HTML
  service.keep(["u", "mark", "sub", "sup"]);
  service.addRule("strikethrough", {
    filter: ["s", "del"],
    replacement: (content) => `~~${content}~~`,
  });
  service.addRule("callout", {
    filter: (node) => node.nodeName === "DIV" && Boolean(CALLOUT_MARKERS[node.getAttribute("data-callout") ?? ""]),
    replacement: (content, node) => {
      const marker = CALLOUT_MARKERS[(node as HTMLElement).getAttribute("data-callout") ?? ""];
      const lines = content.trim().split("\n").map((line) => (line ? `> ${line}` : ">"));
      return `\n\n> [!${marker}]\n${lines.join("\n")}\n\n`;
    },
  });
  service.addRule("image", {
    filter: "img",
    replacement: (_content, node) => {
      const element = node as HTMLElement;
      const src = element.getAttribute("src");
      if (!src) return "";
      const alt = (element.getAttribute("alt") ?? "").replace(/[[\]]/g, "");
      return `![${alt}](${absolute(src)})`;
    },
  });
  service.addRule("link", {
    filter: (node) => node.nodeName === "A" && Boolean(node.getAttribute("href")),
    replacement: (content, node) => `[${content}](${absolute((node as HTMLElement).getAttribute("href")!)})`,
  });
  // 列表：「- 」「1. 」后面只空一格；编辑器给每个列表项包了一层 <p>，单段的项不留空行
  service.addRule("listItem", {
    filter: "li",
    replacement: (content, node) => {
      const item = node as unknown as DomNode & { nextSibling: unknown };
      const parent = item.parentNode;
      let prefix = "- ";
      if (parent?.nodeName === "OL") {
        const siblings = Array.from(parent.childNodes).filter((child) => child.nodeName === "LI");
        prefix = `${(Number(parent.getAttribute?.("start")) || 1) + siblings.indexOf(item)}. `;
      }
      const body = content
        .replace(/^\n+/, "")
        .replace(/\n+$/, "")
        .replace(/\n{3,}/g, "\n\n")
        .replace(/\n/g, `\n${" ".repeat(prefix.length)}`);
      return `${prefix}${body}${item.nextSibling ? "\n" : ""}`;
    },
  });
  service.addRule("tableCell", {
    filter: ["th", "td"],
    replacement: (content, node) => {
      const text = content.replace(/\n+/g, " ").trim().replace(/\|/g, "\\|");
      const first = (node as unknown as DomNode).parentNode?.childNodes[0] === (node as unknown as DomNode);
      return `${first ? "| " : " "}${text} |`;
    },
  });
  service.addRule("tableRow", {
    filter: "tr",
    replacement: (content, node) => {
      const row = node as unknown as DomNode;
      const cells = Array.from(row.childNodes).filter((child) => child.nodeName === "TH" || child.nodeName === "TD").length;
      return `\n${content}${isFirstRow(row) ? `\n|${" --- |".repeat(cells)}` : ""}`;
    },
  });
  service.addRule("table", {
    filter: "table",
    replacement: (content) => `\n\n${content.replace(/\n{2,}/g, "\n").trim()}\n\n`,
  });
  return service;
}

export function tutorialToMarkdown(tutorial: ExportableTutorial, siteUrl: string) {
  const lines = ["---", `title: ${yamlString(tutorial.title)}`, `slug: ${yamlString(tutorial.slug)}`];
  if (tutorial.excerpt) lines.push(`excerpt: ${yamlString(tutorial.excerpt)}`);
  if (tutorial.tags.length) lines.push(`tags: [${tutorial.tags.map(yamlString).join(", ")}]`);
  lines.push(`date: ${tutorial.createdAt.toISOString()}`, `updated: ${tutorial.updatedAt.toISOString()}`, "---", "");
  const body = createService(siteUrl.replace(/\/+$/, "")).turndown(tutorial.content);
  return `${lines.join("\n")}\n${body.trim()}\n`;
}
