import sanitizeHtml from "sanitize-html";

/** 文字颜色只接受颜色值本身，挡住 url()/expression() 之类的 CSS 注入。 */
const CSS_COLOR = /^(?:#[0-9a-f]{3,8}|rgba?\(\s*[\d.\s,%/]+\)|hsla?\(\s*[\d.\s,%/deg]+\)|[a-z]{3,20})$/i;

const TABLE_CELL = ["colspan", "rowspan"];

/**
 * 文章正文白名单，与 Tiptap 编辑器能产出的结构对齐。
 * Server Action 可以绕过编辑器被直接调用，所以入库和渲染时都要过一遍。
 */
const ARTICLE_OPTIONS: sanitizeHtml.IOptions = {
  allowedTags: [
    "h1", "h2", "h3", "h4", "h5", "h6", "p", "br", "hr",
    "strong", "b", "em", "i", "u", "s", "del", "mark", "sub", "sup",
    "code", "pre", "blockquote", "ul", "ol", "li", "a", "img", "span",
    "table", "thead", "tbody", "tr", "th", "td",
  ],
  allowedAttributes: {
    a: ["href", "title", "target", "rel"],
    img: ["src", "alt", "title", "width", "height"],
    code: ["class"],
    span: ["style"],
    ol: ["start", "type"],
    th: TABLE_CELL,
    td: TABLE_CELL,
  },
  allowedClasses: { code: ["language-*"] },
  allowedStyles: { span: { color: [CSS_COLOR], "background-color": [CSS_COLOR] } },
  allowedSchemes: ["http", "https", "mailto"],
  allowedSchemesByTag: { img: ["http", "https"] },
  allowProtocolRelative: false,
  transformTags: {
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
