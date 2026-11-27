import type { Locale } from "../locales";
import type { Messages } from "./types";
import { zhCN } from "./zh-CN";

export type { Messages } from "./types";

/** 四种语言的字典。只在服务端引用（浏览器端只拿到 lib/i18n/client.tsx 传过去的那部分）。 */
const MESSAGES: Record<Locale, Messages> = {
  "zh-CN": zhCN,
  en: zhCN,
  ru: zhCN,
  ja: zhCN,
};

export function messagesFor(locale: Locale): Messages {
  return MESSAGES[locale];
}
