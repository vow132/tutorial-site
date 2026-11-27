import { cookies, headers } from "next/headers";
import { getSettings } from "@/lib/settings";
import { messagesFor, type Messages } from "./messages";
import { ADMIN_LOCALE_COOKIE, isLocale, matchAcceptLanguage, type Locale } from "./locales";
import { formatDateTime, formatNumber, plural, format, type Plural, type Vars } from "./format";

/*
 * 服务端取当前语言和文案：
 * - 前台（ISR 缓存页也能用）：网站语言，站点设置里选的（getSiteI18n）；
 * - 后台：管理员自己选的语言（Cookie），没选时跟网站语言（getAdminI18n，会读 Cookie，只能在动态页面、
 *   Server Action、接口里用）；
 * - 首次安装页：Cookie → 浏览器语言 → 网站语言（还没设置过网站语言）。
 */

export type I18n = {
  locale: Locale;
  m: Messages;
  f: (template: string, vars?: Vars) => string;
  plural: (count: number, forms: Plural, vars?: Vars) => string;
  date: (value: Date | string | number, options?: Intl.DateTimeFormatOptions) => string;
  num: (value: number) => string;
};

export function i18nFor(locale: Locale): I18n {
  return {
    locale,
    m: messagesFor(locale),
    f: format,
    plural: (count, forms, vars) => plural(locale, count, forms, vars),
    date: (value, options) => formatDateTime(locale, value, options),
    num: (value) => formatNumber(locale, value),
  };
}

export async function getSiteLocale(): Promise<Locale> {
  return (await getSettings()).locale;
}

export async function getSiteI18n(): Promise<I18n> {
  return i18nFor(await getSiteLocale());
}

export async function getAdminLocale(): Promise<Locale> {
  const chosen = (await cookies()).get(ADMIN_LOCALE_COOKIE)?.value;
  return isLocale(chosen) ? chosen : getSiteLocale();
}

export async function getAdminI18n(): Promise<I18n> {
  return i18nFor(await getAdminLocale());
}

/** 首次安装页：还没设过网站语言，先按浏览器语言显示，并预选成网站语言 */
export async function getSetupLocale(): Promise<Locale> {
  const chosen = (await cookies()).get(ADMIN_LOCALE_COOKIE)?.value;
  if (isLocale(chosen)) return chosen;
  return matchAcceptLanguage((await headers()).get("accept-language")) ?? getSiteLocale();
}
