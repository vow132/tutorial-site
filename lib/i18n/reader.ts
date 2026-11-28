/*
 * 读者自己选的界面语言（前台顶栏的语言按钮）。
 *
 * 前台页面是 ISR 缓存页，页面里不能读 Cookie（读了就退回每次请求现渲染），所以由 proxy.ts 读 Cookie，
 * 把 /tutorials/x 在内部改写到 /<段>/tutorials/x（app/[lang]/…），浏览器里的网址不变：
 * - 没选过（或选的就是网站语言）：段是 default，按网站语言显示，搜索引擎看到的也是这一份；
 * - 选了别的语言：段是语言代码（en、ru、ja、zh-CN）。
 * 每个页面最多 5 份缓存。教程内容、RSS、sitemap、分享图、邮件都不跟读者语言走。
 * 纯模块：proxy.ts、服务端和浏览器端都能引用。
 */

import { isLocale, LOCALES, type Locale } from "./locales";

export const READER_LOCALE_COOKIE = "reader_locale";

/** 没选语言时的段：按网站语言显示 */
export const DEFAULT_SEGMENT = "default";

export const READER_SEGMENTS = [DEFAULT_SEGMENT, ...LOCALES] as const;
export type ReaderSegment = (typeof READER_SEGMENTS)[number];

/** Cookie 里的值 → 改写用的段；没选或值不对时用 default */
export function readerSegment(cookie: string | undefined | null): ReaderSegment {
  return isLocale(cookie) ? cookie : DEFAULT_SEGMENT;
}

/** 段 → 语言；default 返回 null（调用方用网站语言） */
export function segmentLocale(segment: string | undefined | null): Locale | null {
  return isLocale(segment) ? segment : null;
}

/**
 * 不按读者语言改写的路径：后台（有自己的语言）、接口、Next 自己的文件、上传图片、分享图、网站图标、
 * 评论框，以及按网站语言生成的 RSS、sitemap、robots、网站清单。其余都是 app/[lang] 下的前台页面。
 */
const UNTRANSLATED =
  /^\/(?:admin|api|_next|uploads|og|brand|comments|\.well-known)(?:\/|$)|^\/(?:favicon\.ico|feed\.xml|sitemap\.xml|robots\.txt|manifest\.webmanifest)$|^\/__/;

export function isReaderPage(pathname: string): boolean {
  return !UNTRANSLATED.test(pathname);
}

/** 后台的地址：/admin 和 /admin/…（/administrator 这样的是前台的 404，不跳登录页） */
export function isAdminPath(pathname: string): boolean {
  return pathname === "/admin" || pathname.startsWith("/admin/");
}

/** 改写后的内部路径：/ → /default，/tutorials/x → /en/tutorials/x */
export function readerRewritePath(segment: ReaderSegment, pathname: string): string {
  return pathname === "/" ? `/${segment}` : `/${segment}${pathname}`;
}

/**
 * 去掉路径开头的语言段：预渲染时服务端的 usePathname() 是改写后的 /default/tutorials，浏览器里是 /tutorials，
 * 两边都先去掉再用，hydration 才对得上（真实的前台路径第一段不会是语言段：/en/… 这样的地址本身就是 404）。
 */
export function stripReaderSegment(pathname: string): string {
  const match = /^\/([^/]+)(\/.*)?$/.exec(pathname);
  if (!match || !(READER_SEGMENTS as readonly string[]).includes(match[1])) return pathname;
  return match[2] || "/";
}

/**
 * 浏览器端存读者的选择：选的就是网站语言时清掉 Cookie（回到 default 那份缓存，也跟着站长以后换的网站语言走）。
 * 只在浏览器里调用。
 */
export function readerCookieAssignment(locale: Locale, siteLocale: Locale, secure: boolean): string {
  const base = `${READER_LOCALE_COOKIE}=${locale === siteLocale ? "" : locale}; Path=/; SameSite=Lax`;
  return `${base}; Max-Age=${locale === siteLocale ? 0 : 60 * 60 * 24 * 365}${secure ? "; Secure" : ""}`;
}
