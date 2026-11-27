"use client";

import { useId, useTransition } from "react";
import { useRouter } from "next/navigation";
import { setAdminLocale } from "@/lib/actions/locale";
import { LOCALES, LOCALE_NAMES, type Locale } from "@/lib/i18n/locales";

/**
 * 后台界面语言选择（登录页、首次安装页、后台侧栏）：存成管理员自己的 Cookie，选完立即按新语言重新渲染。
 * 选项名用各自的语言写（简体中文 / English / Русский / 日本語），看不懂当前界面也找得到。
 * name 不为空时同时作为表单字段提交（首次安装页拿它当网站语言）。
 */
export default function LanguageSelect({
  value,
  label,
  name,
  className = "",
}: {
  value: Locale;
  label: string;
  name?: string;
  className?: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const id = useId();
  return (
    <div className={`flex items-center gap-2 text-xs text-ink-3 ${className}`}>
      <label htmlFor={id} className="flex items-center gap-1.5">
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden="true">
          <circle cx="8" cy="8" r="6.5" />
          <path d="M1.5 8h13M8 1.5c1.8 1.8 2.7 4 2.7 6.5S9.8 12.7 8 14.5M8 1.5C6.2 3.3 5.3 5.5 5.3 8s.9 4.7 2.7 6.5" />
        </svg>
        <span>{label}</span>
      </label>
      <select
        id={id}
        name={name}
        value={value}
        disabled={pending}
        data-demo-allow
        onChange={(event) => {
          const next = event.target.value;
          startTransition(async () => {
            await setAdminLocale(next);
            router.refresh();
          });
        }}
        className="h-8 rounded-lg border border-line bg-paper px-2 text-xs text-ink-2 outline-none focus:border-accent disabled:opacity-60"
      >
        {LOCALES.map((locale) => (
          <option key={locale} value={locale} lang={locale}>
            {LOCALE_NAMES[locale]}
          </option>
        ))}
      </select>
    </div>
  );
}
