import { INTL_LOCALE, type Locale } from "./locales";

/*
 * 文案里的占位符和复数。纯模块，浏览器端也能用。
 * - 占位符写成 {name}，format() 换成对应的值；
 * - 要按数量变化的文案（俄语有 1 / 2–4 / 5+ 三种形式）写成 Plural 对象，用 plural() 取。
 */

export type Plural = { zero?: string; one?: string; two?: string; few?: string; many?: string; other: string };

/** 写字典时用：标记这一条是按数量变化的文案 */
export const p = (forms: Plural): Plural => forms;

export type Vars = Record<string, string | number>;

export function format(template: string, vars?: Vars): string {
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (match, name: string) => (name in vars ? String(vars[name]) : match));
}

/**
 * 纯函数校验里取错误文字：传了文案 t 就按它格式化；没传（只关心结果、不显示错误的调用方）返回键名。
 */
export function textOrKey<T extends Record<string, unknown>>(t: T | undefined, key: keyof T & string, vars?: Vars): string {
  const template = t?.[key];
  return typeof template === "string" ? format(template, vars) : key;
}

const rules = new Map<Locale, Intl.PluralRules>();

/** 按数量取文案（{n} 换成格式化后的数字），其余占位符照常替换 */
export function plural(locale: Locale, count: number, forms: Plural, vars?: Vars): string {
  let rule = rules.get(locale);
  if (!rule) {
    rule = new Intl.PluralRules(INTL_LOCALE[locale]);
    rules.set(locale, rule);
  }
  const category = rule.select(count) as keyof Plural;
  const template = forms[category] ?? forms.other;
  return format(template, { n: formatNumber(locale, count), ...vars });
}

export function formatNumber(locale: Locale, value: number): string {
  return value.toLocaleString(INTL_LOCALE[locale]);
}

/** 显示时间用的时区：和阅读统计按天归档（lib/site-day.ts）一致，固定北京时间，服务端和浏览器算出来一样 */
export const SITE_TIME_ZONE = "Asia/Shanghai";

const dateFormats = new Map<string, Intl.DateTimeFormat>();

/** 按语言格式化日期时间（默认「年月日」），同一组参数复用 Intl.DateTimeFormat */
export function formatDateTime(locale: Locale, date: Date | string | number, options: Intl.DateTimeFormatOptions = { dateStyle: "medium" }): string {
  const key = `${locale}|${JSON.stringify(options)}`;
  let formatter = dateFormats.get(key);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat(INTL_LOCALE[locale], { timeZone: SITE_TIME_ZONE, ...options });
    dateFormats.set(key, formatter);
  }
  return formatter.format(new Date(date));
}
