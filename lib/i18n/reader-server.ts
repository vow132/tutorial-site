import { cache } from "react";
import { cookies } from "next/headers";
import { lang } from "next/root-params";
import { getSettings, type SiteSettings } from "@/lib/settings";
import { switchDefaultTexts } from "@/lib/locale-defaults";
import { i18nFor, type I18n } from "./core";
import type { Locale } from "./locales";
import { READER_LOCALE_COOKIE, segmentLocale } from "./reader";

/*
 * 前台读者看到的语言（lib/i18n/reader.ts）：
 * - app/[lang] 下的服务端组件用 getReaderI18n() / getReaderSettings()：语言来自根参数 [lang]
 *   （proxy.ts 按 Cookie 改写进来的），default 时是网站语言。读的是路由参数不是 Cookie，ISR 缓存页照样能用；
 * - 接口（Route Handler 不能用 next/root-params）用 getRequestReaderI18n()，直接读 Cookie。
 * 这个文件只给前台用；后台、邮件、告警、RSS 等按网站语言的用 lib/i18n/server.ts。
 */

/** app/[lang] 下的读者语言；不在 app/[lang] 下（后台预览等）时是网站语言 */
export const getReaderLocale = cache(async (): Promise<Locale> => {
  const chosen = segmentLocale(await lang());
  return chosen ?? (await getSettings()).locale;
});

export async function getReaderI18n(): Promise<I18n> {
  return i18nFor(await getReaderLocale());
}

/**
 * 读者看到的站点设置：站长没改过的默认文字（站名、首页文案、页脚、「从这里开始」）换成读者语言的默认值，
 * 改过的照原样（教程网站长写的内容不翻译）。
 */
export const getReaderSettings = cache(async (): Promise<SiteSettings> => {
  const [settings, locale] = await Promise.all([getSettings(), getReaderLocale()]);
  return locale === settings.locale ? settings : switchDefaultTexts(settings, settings.locale, locale);
});

/** 接口里的读者语言：读 Cookie，没选时是网站语言 */
export async function getRequestReaderI18n(): Promise<I18n> {
  const chosen = segmentLocale((await cookies()).get(READER_LOCALE_COOKIE)?.value);
  return i18nFor(chosen ?? (await getSettings()).locale);
}
