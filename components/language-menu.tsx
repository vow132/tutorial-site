"use client";

import { useI18n } from "@/lib/i18n/client";
import { LOCALE_NAMES, LOCALES, type Locale } from "@/lib/i18n/locales";
import { readerCookieAssignment } from "@/lib/i18n/reader";

/**
 * 顶栏的语言按钮（主题按钮旁边）：读者自己选看到的界面语言，存在 Cookie 里一年（lib/i18n/reader.ts）。
 * 外观和主题按钮一样是个圆按钮，里面盖着一个透明的原生 <select>：键盘、读屏软件、手机上的选择器都现成可用。
 * 选的就是网站语言时清掉 Cookie。选完整页刷新：proxy.ts 按新的 Cookie 改写到对应语言的那份页面。
 */
export default function LanguageMenu({ siteLocale }: { siteLocale: Locale }) {
  const { locale, m } = useI18n();
  const label = m.reader.language.label;
  return (
    <div
      title={label}
      className="relative flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-line bg-surface/90 text-ink-2 shadow-capsule backdrop-blur-md transition-colors focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-accent/60 hover:bg-paper hover:text-ink"
    >
      <svg
        width="18"
        height="18"
        viewBox="0 0 18 18"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <circle cx="9" cy="9" r="7.2" />
        <path d="M1.8 9h14.4M9 1.8c2 2 3 4.4 3 7.2s-1 5.2-3 7.2M9 1.8C7 3.8 6 6.2 6 9s1 5.2 3 7.2" />
      </svg>
      <select
        aria-label={label}
        value={locale}
        onChange={(event) => {
          document.cookie = readerCookieAssignment(event.target.value as Locale, siteLocale, window.location.protocol === "https:");
          window.location.reload();
        }}
        className="absolute inset-0 h-full w-full cursor-pointer appearance-none rounded-full opacity-0"
      >
        {LOCALES.map((option) => (
          <option key={option} value={option} lang={option}>
            {LOCALE_NAMES[option]}
          </option>
        ))}
      </select>
    </div>
  );
}
