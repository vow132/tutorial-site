import sanitizeHtml from "sanitize-html";
import { CALLOUT_TYPES } from "@/lib/callouts";

/** 文字颜色只接受颜色值本身，挡住 url()/expression() 之类的 CSS 注入。 */
const CSS_COLOR = /^(?:#[0-9a-f]{3,8}|rgba?\(\s*[\d.\s,%/]+\)|hsla?\(\s*[\d.\s,%/deg]+\)|[a-z]{3,20})$/i;

const TABLE_CELL = ["colspan", "rowspan"];

const CALLOUT_VALUES = new Set<string>(CALLOUT_TYPES.map((item) => item.value));

/**
 * 文章正文白名单，与 Tiptap 编辑器能产出的结构对齐。
 * Server Action 可以绕过编辑器被直接调用，所以入库和渲染时都要过一遍。
 */
const ARTICLE_OPTIONS: sanitizeHtml.IOptions = {
  allowedTags: [
    "h1", "h2", "h3", "h4", "h5", "h6", "p", "br", "hr",
    "strong", "b", "em", "i", "u", "s", "del", "mark", "sub", "sup",
    "code", "pre", "blockquote", "ul", "ol", "li", "a", "img", "span",
    "table", "thead", "tbody", "tr", "th", "td", "div",
  ],
  allowedAttributes: {
    a: ["href", "title", "target", "rel"],
    img: ["src", "alt", "title", "width", "height"],
    code: ["class"],
    span: ["style"],
    ol: ["start", "type"],
    th: TABLE_CELL,
    td: TABLE_CELL,
    // 提示框（components/editor/callout.ts）：类型在 transformTags 里校验
    div: ["data-callout"],
  },
  allowedClasses: { code: ["language-*"] },
  allowedStyles: { span: { color: [CSS_COLOR], "background-color": [CSS_COLOR] } },
  allowedSchemes: ["http", "https", "mailto"],
  allowedSchemesByTag: { img: ["http", "https"] },
  allowProtocolRelative: false,
  transformTags: {
    // 提示框只认固定的几种类型，其他值连同属性一起去掉（只剩普通 div）
    div: (tagName, attribs) => {
      const callout = attribs["data-callout"];
      const kept: sanitizeHtml.Attributes = {};
      if (callout && CALLOUT_VALUES.has(callout)) kept["data-callout"] = callout;
      return { tagName, attribs: kept };
    },
    a: (tagName, attribs) => ({
      tagName,
      attribs:
        attribs.target === "_blank"
          ? { ...attribs, rel: "noopener noreferrer nofollow" }
          : attribs,
    }),
  },
};

export function sanitizeArticleHtml(html: string): string {
  return sanitizeHtml(html, ARTICLE_OPTIONS);
}
