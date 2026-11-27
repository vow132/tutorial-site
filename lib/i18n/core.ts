import { messagesFor, type Messages } from "./messages";
import type { Locale } from "./locales";
import { formatDateTime, formatNumber, plural, format, type Plural, type Vars } from "./format";

/** 某种语言的文案和格式化函数（纯模块：服务端、单元测试都能用；读 Cookie / 设置的在 lib/i18n/server.ts） */
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
