import { createHash } from "node:crypto";
import { THEME_SCRIPT } from "./theme-script.mjs";

/*
 * 内容安全策略（CSP），分前台和后台两套。
 *
 * - 前台（next.config.ts 的 headers()）：文章页、首页等是 ISR 缓存页，同一份 HTML 发给所有访客，
 *   没法每个请求换 nonce（Next 文档：用 nonce 必须整站动态渲染，ISR 和 CDN 缓存都会失效）；
 *   Next 内联的 RSC 数据脚本每页内容都不同，也算不了哈希。所以前台 script-src 保留 'unsafe-inline'。
 *   正文 HTML 入库和渲染各过一次白名单（lib/sanitize.ts），CSP 在此之上禁止外部脚本、插件、
 *   <base> 劫持、表单外发和被其他站点嵌入。
 * - 后台（/admin/*，proxy.ts 设置）：页面本来就是动态渲染。每个请求生成一个 nonce，Next 渲染时自动加到
 *   框架脚本上；'strict-dynamic' 让这些脚本按需加载的分块（编辑器、通行密钥等）也能执行；根布局的
 *   主题脚本按 SHA-256 放行。HTML 里混进来的 <script>、onerror 这类内联事件处理器和 javascript: 链接
 *   都不会执行：多人协作时，就算作者的正文躲过了白名单，站长打开预览或编辑页也不会中招。
 *
 * 两套都保留 style-src 'unsafe-inline'：React 的 style 属性、编辑器（ProseMirror）和主题色 <style>
 * 都要用，而 style 属性没法加 nonce；样式注入不能执行脚本。
 * img-src 允许 data:（两步验证二维码等）、blob: 和 https:（正文引用的外站图片）。不允许 http:：
 * HTTPS 页面上的 http 图片本来就会被浏览器升级或拦截。
 *
 * 人机验证（Cloudflare Turnstile，lib/turnstile.ts）：两套都放行 challenges.cloudflare.com 的脚本和 iframe
 * （Cloudflare 文档要求的两项）。后台有 'strict-dynamic' 时浏览器会忽略 script-src 里的域名，
 * 小组件的脚本由受信任的脚本插入，照样能执行；写上域名是给不支持 'strict-dynamic' 的旧浏览器。
 * 是否开启存在数据库里、运行时才知道，所以这里不管开没开都放行，那个域名上只有 Cloudflare 自己的脚本。
 */

export const TURNSTILE_ORIGIN = "https://challenges.cloudflare.com";

const isDev = process.env.NODE_ENV === "development";

/** 根布局内联主题脚本的哈希（内容固定，见 lib/theme-script.mjs）。 */
export const THEME_SCRIPT_HASH = `'sha256-${createHash("sha256").update(THEME_SCRIPT, "utf8").digest("base64")}'`;

function policy(scriptSources, upgradeInsecureRequests) {
  return [
    "default-src 'self'",
    // 开发环境 React 用 eval 还原服务端报错的调用栈（Next 文档），生产环境不需要
    `script-src ${scriptSources}${isDev ? " 'unsafe-eval'" : ""}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https:",
    "font-src 'self' data:",
    `frame-src 'self' ${TURNSTILE_ORIGIN}`,
    `connect-src 'self'${isDev ? " ws: wss:" : ""}`,
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    ...(upgradeInsecureRequests ? ["upgrade-insecure-requests"] : []),
  ].join("; ");
}

/** 前台页面（ISR 缓存页）。经 HTTPS 反向代理访问时加上 upgrade-insecure-requests。 */
export function publicContentSecurityPolicy(upgradeInsecureRequests) {
  return policy(`'self' 'unsafe-inline' ${TURNSTILE_ORIGIN}`, upgradeInsecureRequests);
}

/** 后台页面：只放行带本次请求 nonce 的脚本、它们加载的脚本和主题脚本。 */
export function adminContentSecurityPolicy(nonce, upgradeInsecureRequests) {
  if (!/^[A-Za-z0-9+/=_-]{16,}$/.test(nonce)) throw new Error("invalid CSP nonce");
  return policy(`'self' 'nonce-${nonce}' 'strict-dynamic' ${THEME_SCRIPT_HASH} ${TURNSTILE_ORIGIN}`, upgradeInsecureRequests);
}
