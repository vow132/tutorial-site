/*
 * 界面语言：站点设置里选的网站语言（前台读者看到的）和每个管理员自己的后台语言。
 * 教程内容本身只有一种语言（站长写什么就是什么），所以前台不按读者切换、网址里不带语言。
 * 纯模块，浏览器端也能引用。
 */

export const LOCALES = ["zh-CN", "en", "ru", "ja"] as const;
export type Locale = (typeof LOCALES)[number];

export const DEFAULT_LOCALE: Locale = "zh-CN";

/** 语言选择框里显示的名字：用各自的语言写，看不懂当前界面的人也找得到自己的语言 */
export const LOCALE_NAMES: Record<Locale, string> = {
  "zh-CN": "简体中文",
  en: "English",
  ru: "Русский",
  ja: "日本語",
};

/** Intl 日期、数字格式用的地区 */
export const INTL_LOCALE: Record<Locale, string> = { "zh-CN": "zh-CN", en: "en-US", ru: "ru-RU", ja: "ja-JP" };

/** OpenGraph 的 og:locale */
export const OG_LOCALE: Record<Locale, string> = { "zh-CN": "zh_CN", en: "en_US", ru: "ru_RU", ja: "ja_JP" };

export function isLocale(value: unknown): value is Locale {
  return typeof value === "string" && (LOCALES as readonly string[]).includes(value);
}

export function readLocale(value: unknown, fallback: Locale = DEFAULT_LOCALE): Locale {
  return isLocale(value) ? value : fallback;
}

/**
 * 从 Accept-Language 里挑最合适的语言（首次安装页用来预选）。
 * 按 q 值排序，zh / zh-CN / zh-Hans / zh-TW 都算中文，其余按主语言匹配。
 */
export function matchAcceptLanguage(header: string | null | undefined): Locale | null {
  if (!header) return null;
  const ranked = header
    .split(",")
    .map((part, index) => {
      const [tag, ...params] = part.trim().split(";");
      const q = params.map((p) => p.trim()).find((p) => p.startsWith("q="));
      const weight = q ? Number(q.slice(2)) : 1;
      return { tag: tag.trim().toLowerCase(), weight: Number.isFinite(weight) ? weight : 0, index };
    })
    .filter((item) => item.tag && item.tag !== "*" && item.weight > 0)
    .sort((a, b) => b.weight - a.weight || a.index - b.index);
  for (const { tag } of ranked) {
    const primary = tag.split("-")[0];
    if (primary === "zh") return "zh-CN";
    const found = LOCALES.find((locale) => locale.toLowerCase() === primary);
    if (found) return found;
  }
  return null;
}

/** 估算阅读时间：每分钟读多少个字符（中文、日文按字，英文、俄文按字母和空格） */
export const READING_CHARS_PER_MINUTE: Record<Locale, number> = { "zh-CN": 400, en: 1100, ru: 1000, ja: 500 };

/** 管理员自己选的后台语言（Cookie），没选时跟网站语言 */
export const ADMIN_LOCALE_COOKIE = "admin_locale";
