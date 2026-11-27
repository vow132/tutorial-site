/*
 * 可选的第三方评论（站点设置 →「评论」，默认关闭）。本站不存评论：评论存在站长自己选的服务里，
 * 实名、审核、反垃圾由那个服务负责（国内跟帖评论有实名和审核要求，选服务时留意）。
 *
 * 文章页不直接加载评论脚本：文末放一个 iframe（components/comments.tsx），读者滚动到附近才加载
 * /comments/frame（app/comments/frame/route.ts）。那个小页面按所选服务单独下发 CSP，只放行该服务的
 * 脚本；文章页自己的 CSP 不变（镜像和站点无关，CSP 写死在构建里，放不进站长后来填的地址）。
 *
 * 这里都是纯函数：设置的读取 / 校验、前端资源地址、评论页的 CSP 和初始化参数。
 */

import type { Locale } from "@/lib/i18n/locales";

export const COMMENT_PROVIDERS = {
  none: { label: "关闭" },
  waline: { label: "Waline" },
  twikoo: { label: "Twikoo" },
  artalk: { label: "Artalk" },
  giscus: { label: "Giscus（GitHub Discussions）" },
} as const;
export type CommentProvider = keyof typeof COMMENT_PROVIDERS;

/** Waline / Twikoo 的前端脚本从哪个公共 CDN 加载（Artalk 用它自己服务端提供的脚本，Giscus 用 giscus.app）。 */
export const COMMENT_CDNS = {
  npmmirror: { label: "npmmirror（国内快）", origin: "https://registry.npmmirror.com" },
  unpkg: { label: "unpkg", origin: "https://unpkg.com" },
  jsdelivr: { label: "jsDelivr", origin: "https://cdn.jsdelivr.net" },
} as const;
export type CommentCdn = keyof typeof COMMENT_CDNS;

/** 固定版本（升级时改这里），避免 CDN 上的「最新版」悄悄换掉在读者浏览器里运行的代码。 */
export const COMMENT_CLIENTS = {
  waline: { pkg: "@waline/client", version: "3.16.2", js: "dist/waline.umd.js", css: "dist/waline.css" },
  twikoo: { pkg: "twikoo", version: "2.0.17", js: "dist/twikoo.all.min.js" },
} as const;

export type CommentsSettings = {
  provider: CommentProvider;
  /** Waline / Twikoo / Artalk 的服务端地址（https） */
  server: string;
  /** Artalk 后台里的站点名 */
  site: string;
  /** Giscus：在 giscus.app 生成的配置 */
  repo: string;
  repoId: string;
  category: string;
  categoryId: string;
  cdn: CommentCdn;
};

export const defaultComments: CommentsSettings = {
  provider: "none",
  server: "",
  site: "",
  repo: "",
  repoId: "",
  category: "",
  categoryId: "",
  cdn: "npmmirror",
};

const REPO = /^[A-Za-z0-9_.-]{1,100}\/[A-Za-z0-9_.-]{1,100}$/;
const GITHUB_ID = /^[A-Za-z0-9_=-]{4,64}$/;

/** 服务端地址：只收 https 的纯地址（不带查询串、片段、账号密码），去掉末尾的 /。 */
export function parseCommentServer(raw: string): { value: string } | { error: string } {
  const value = raw.trim().replace(/\/+$/, "");
  if (!value) return { error: "请填写评论服务的地址" };
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return { error: "评论服务地址格式不对，应类似 https://comments.example.com" };
  }
  if (url.protocol !== "https:") return { error: "评论服务地址要用 https（浏览器会拦下 https 页面里的 http 请求）" };
  if (url.username || url.password || url.search || url.hash) return { error: "评论服务地址只填网址本身，不要带账号、? 或 #" };
  return { value: `${url.origin}${url.pathname.replace(/\/+$/, "")}` };
}

const str = (value: unknown) => (typeof value === "string" ? value : "");

/** 读取存库的设置；不完整或格式不对时按「关闭」处理，前台不会因为坏数据出错。 */
export function readComments(raw: unknown): CommentsSettings {
  if (!raw || typeof raw !== "object") return defaultComments;
  const data = raw as Record<string, unknown>;
  const provider = str(data.provider) in COMMENT_PROVIDERS ? (str(data.provider) as CommentProvider) : "none";
  const cdn = str(data.cdn) in COMMENT_CDNS ? (str(data.cdn) as CommentCdn) : "npmmirror";
  const settings: CommentsSettings = {
    provider,
    server: str(data.server),
    site: str(data.site),
    repo: str(data.repo),
    repoId: str(data.repoId),
    category: str(data.category),
    categoryId: str(data.categoryId),
    cdn,
  };
  const checked = parseCommentsInput({ ...settings });
  return "data" in checked ? checked.data : { ...defaultComments, cdn };
}

/** 后台表单提交的值 → 设置。只保留所选服务用得到的字段。 */
export function parseCommentsInput(input: Record<keyof CommentsSettings, string>): { data: CommentsSettings } | { error: string } {
  const provider = input.provider in COMMENT_PROVIDERS ? (input.provider as CommentProvider) : null;
  if (!provider) return { error: "请选择评论服务" };
  const cdn = input.cdn in COMMENT_CDNS ? (input.cdn as CommentCdn) : "npmmirror";
  const data: CommentsSettings = { ...defaultComments, provider, cdn };
  if (provider === "none") return { data };

  if (provider === "giscus") {
    const repo = input.repo.trim();
    if (!REPO.test(repo)) return { error: "Giscus 仓库请填 用户名/仓库名，例如 octocat/blog-comments" };
    for (const [value, label] of [
      [input.repoId.trim(), "仓库 ID（data-repo-id）"],
      [input.categoryId.trim(), "分类 ID（data-category-id）"],
    ] as const) {
      if (!GITHUB_ID.test(value)) return { error: `Giscus 的${label}格式不对，请从 giscus.app 生成的代码里复制` };
    }
    const category = input.category.trim();
    if (!category || category.length > 50 || /["<>]/.test(category)) return { error: "请填写 Giscus 的分类名（data-category）" };
    return { data: { ...data, repo, repoId: input.repoId.trim(), category, categoryId: input.categoryId.trim() } };
  }

  const server = parseCommentServer(input.server);
  if ("error" in server) return { error: server.error };
  if (provider === "artalk") {
    const site = input.site.trim();
    if (!site || site.length > 50 || /["<>]/.test(site)) return { error: "请填写 Artalk 后台里的站点名" };
    return { data: { ...data, server: server.value, site } };
  }
  return { data: { ...data, server: server.value } };
}

/** 公共 CDN 上某个 npm 包里的文件地址（固定版本）。 */
export function cdnFileUrl(cdn: CommentCdn, pkg: string, version: string, file: string) {
  const { origin } = COMMENT_CDNS[cdn];
  if (cdn === "npmmirror") return `${origin}/${pkg}/${version}/files/${file}`;
  if (cdn === "jsdelivr") return `${origin}/npm/${pkg}@${version}/${file}`;
  return `${origin}/${pkg}@${version}/${file}`;
}

export type CommentTheme = "light" | "dark";

/** 评论页需要加载的资源和传给脚本的参数。 */
export type CommentEmbed = {
  provider: Exclude<CommentProvider, "none">;
  /** 文章地址：评论页被直接打开（比如 Giscus 登录后跳回来）时转回文章 */
  pagePath: string;
  script: string;
  /** 外链样式（Waline / Artalk；Twikoo 的样式打包在脚本里，Giscus 在它自己的 iframe 里） */
  style?: string;
  /** Giscus 用 <script data-*> 配置，其余用 init 参数 */
  attributes?: Record<string, string>;
  options?: Record<string, unknown>;
  scriptOrigins: string[];
  frameOrigins: string[];
};

/**
 * 各评论组件自己的界面语言代码（跟网站语言走）。Twikoo 没有俄语界面，俄语站点用英语。
 */
const WIDGET_LANG: Record<"waline" | "twikoo" | "artalk" | "giscus", Record<Locale, string>> = {
  waline: { "zh-CN": "zh-CN", en: "en-US", ru: "ru-RU", ja: "jp-JP" },
  twikoo: { "zh-CN": "zh-CN", en: "en", ru: "en", ja: "ja" },
  artalk: { "zh-CN": "zh-CN", en: "en", ru: "ru", ja: "ja" },
  giscus: { "zh-CN": "zh-CN", en: "en", ru: "ru", ja: "ja" },
};

export function commentEmbed(
  settings: CommentsSettings,
  page: { path: string; title: string },
  theme: CommentTheme,
  locale: Locale = "zh-CN",
): CommentEmbed | null {
  switch (settings.provider) {
    case "waline": {
      const client = COMMENT_CLIENTS.waline;
      return {
        provider: "waline",
        pagePath: page.path,
        script: cdnFileUrl(settings.cdn, client.pkg, client.version, client.js),
        style: cdnFileUrl(settings.cdn, client.pkg, client.version, client.css),
        // 表情包、GIF 搜索默认从境外服务加载，先关掉；需要的话在 Waline 服务端配置
        options: { serverURL: settings.server, path: page.path, lang: WIDGET_LANG.waline[locale], dark: 'html[data-theme="dark"]', emoji: false, search: false },
        scriptOrigins: [COMMENT_CDNS[settings.cdn].origin],
        frameOrigins: [],
      };
    }
    case "twikoo": {
      const client = COMMENT_CLIENTS.twikoo;
      return {
        provider: "twikoo",
        pagePath: page.path,
        script: cdnFileUrl(settings.cdn, client.pkg, client.version, client.js),
        options: { envId: settings.server, path: page.path, lang: WIDGET_LANG.twikoo[locale] },
        scriptOrigins: [COMMENT_CDNS[settings.cdn].origin],
        frameOrigins: [],
      };
    }
    case "artalk": {
      const origin = new URL(settings.server).origin;
      return {
        provider: "artalk",
        pagePath: page.path,
        script: `${settings.server}/dist/Artalk.js`,
        style: `${settings.server}/dist/Artalk.css`,
        options: { server: settings.server, site: settings.site, pageKey: page.path, pageTitle: page.title, darkMode: theme === "dark", locale: WIDGET_LANG.artalk[locale] },
        scriptOrigins: [origin],
        frameOrigins: [],
      };
    }
    case "giscus":
      return {
        provider: "giscus",
        pagePath: page.path,
        script: "https://giscus.app/client.js",
        attributes: {
          "data-repo": settings.repo,
          "data-repo-id": settings.repoId,
          "data-category": settings.category,
          "data-category-id": settings.categoryId,
          // 评论页的地址是 /comments/frame，所以按文章路径精确匹配讨论帖
          "data-mapping": "specific",
          "data-term": page.path,
          "data-strict": "1",
          "data-reactions-enabled": "1",
          "data-emit-metadata": "0",
          "data-input-position": "top",
          "data-theme": theme,
          "data-lang": WIDGET_LANG.giscus[locale],
          "data-loading": "lazy",
        },
        scriptOrigins: ["https://giscus.app"],
        frameOrigins: ["https://giscus.app"],
      };
    default:
      return null;
  }
}

/**
 * 评论页的 CSP：脚本只放行本次请求的 nonce（初始化脚本）和所选服务的来源；
 * 样式要允许内联（评论组件会插入 style）；头像、表情来自各种图床，图片和网络请求放宽到 https。
 * 只允许被本站页面嵌入。
 */
export function commentFrameCsp(embed: CommentEmbed, nonce: string) {
  const scripts = embed.scriptOrigins.join(" ");
  return [
    "default-src 'none'",
    `script-src 'nonce-${nonce}' ${scripts}`,
    `style-src 'unsafe-inline' ${scripts}`,
    "img-src https: data: blob:",
    `font-src data: ${scripts}`,
    "connect-src https:",
    `frame-src ${embed.frameOrigins.length ? embed.frameOrigins.join(" ") : "'none'"}`,
    "form-action 'none'",
    "base-uri 'none'",
    "frame-ancestors 'self'",
  ].join("; ");
}

/** 文章页地址 → 评论用的页面标识（各服务按它区分是哪篇文章的评论）。 */
export function commentPagePath(slug: string) {
  return `/tutorials/${slug}`;
}

const escapeAttr = (value: string) =>
  value.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** 放进内联 <script> 的 JSON：转义 <、U+2028/2029，不会提前结束脚本。 */
const scriptJson = (value: unknown) =>
  JSON.stringify(value).replace(/</g, "\\u003c").replace(/\u2028/g, "\\u2028").replace(/\u2029/g, "\\u2029");

/**
 * 评论页（/comments/frame）的完整 HTML。初始化脚本带 nonce；高度变化时通知文章页调整 iframe 高度，
 * 文章页切换亮 / 暗主题时跟着切换。脚本没能从 CDN / 评论服务下载时显示提示，而不是一片空白。
 */
export function commentFrameHtml(
  embed: CommentEmbed,
  nonce: string,
  theme: CommentTheme,
  text: { lang: Locale; title: string; loadFailed: string } = { lang: "zh-CN", title: "评论", loadFailed: "评论没能加载出来：评论服务或脚本地址暂时无法访问，请稍后刷新再试。" },
) {
  const n = escapeAttr(nonce);
  const attributes = Object.entries(embed.attributes ?? {})
    .map(([key, value]) => ` ${key}="${escapeAttr(value)}"`)
    .join("");
  const config = scriptJson({
    provider: embed.provider,
    options: { ...embed.options, el: "#comments" },
    back: `${encodeURI(embed.pagePath)}#comments`,
    failed: text.loadFailed,
  });
  const providerScript =
    embed.provider === "giscus"
      ? `<script nonce="${n}" src="${escapeAttr(embed.script)}"${attributes} crossorigin="anonymous" async></script>`
      : `<script nonce="${n}" src="${escapeAttr(embed.script)}"></script>`;
  return `<!doctype html>
<html lang="${escapeAttr(text.lang)}" data-theme="${theme}" style="color-scheme:${theme}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>${escapeAttr(text.title)}</title>
<style nonce="${n}">
body{margin:0;background:transparent;color:#1f2328;font:15px/1.6 system-ui,-apple-system,"PingFang SC","Hiragino Sans GB","Microsoft YaHei",sans-serif}
html[data-theme="dark"] body{color:#e6edf3}
#comments{min-height:120px}
.comments-notice{padding:20px 4px;color:#6b7280;font-size:14px}
html[data-theme="dark"] .comments-notice{color:#9ca3af}
</style>
${embed.style ? `<link rel="stylesheet" href="${escapeAttr(embed.style)}">` : ""}
</head>
<body>
<div id="comments"${embed.provider === "giscus" ? ' class="giscus"' : ""}></div>
${providerScript}
<script nonce="${n}">
(function () {
  var cfg = ${config};
  var root = document.documentElement;
  var box = document.getElementById("comments");
  var instance = null;
  // 被直接打开（不在文章页的 iframe 里）：Giscus 登录后会跳回这个地址，先让它记下登录状态，页面加载完就回到文章
  if (window.top === window) {
    window.addEventListener("load", function () { location.replace(cfg.back); });
    return;
  }
  function report() {
    parent.postMessage({ type: "comments:height", height: Math.ceil(root.scrollHeight) }, location.origin);
  }
  if (window.ResizeObserver) new ResizeObserver(report).observe(document.body);
  window.addEventListener("load", report);
  function notice(text) {
    box.innerHTML = "";
    var p = document.createElement("p");
    p.className = "comments-notice";
    p.textContent = text;
    box.appendChild(p);
    report();
  }
  function setTheme(theme) {
    root.dataset.theme = theme;
    root.style.colorScheme = theme;
    if (instance && typeof instance.setDarkMode === "function") instance.setDarkMode(theme === "dark");
    var giscus = document.querySelector("iframe.giscus-frame");
    if (giscus) giscus.contentWindow.postMessage({ giscus: { setConfig: { theme: theme } } }, "https://giscus.app");
  }
  window.addEventListener("message", function (event) {
    if (event.origin !== location.origin || event.source !== parent) return;
    if (event.data && event.data.type === "comments:theme") setTheme(event.data.theme === "dark" ? "dark" : "light");
  });
  var failed = cfg.failed;
  try {
    if (cfg.provider === "waline") {
      if (!window.Waline) return notice(failed);
      instance = window.Waline.init(cfg.options);
    } else if (cfg.provider === "twikoo") {
      if (!window.twikoo) return notice(failed);
      window.twikoo.init(cfg.options);
    } else if (cfg.provider === "artalk") {
      if (!window.Artalk) return notice(failed);
      instance = window.Artalk.init(cfg.options);
    }
  } catch (error) {
    notice(failed);
  }
  report();
})();
</script>
</body>
</html>`;
}
