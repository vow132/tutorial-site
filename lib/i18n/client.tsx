"use client";

import { createContext, useContext, useMemo, type ReactNode } from "react";
import type { Messages } from "./messages/types";
import { formatDateTime, formatNumber, plural, format, type Plural, type Vars } from "./format";
import type { Locale } from "./locales";

/*
 * 浏览器端组件的文案。只把需要的部分从服务端传过来，不把四种语言的字典都打进 JS 包：
 * 根布局传前台用的 common + reader（网站语言），后台布局再套一层，加上 admin（管理员的后台语言）。
 */

export type ClientMessages = Pick<Messages, "common" | "reader"> & { admin?: Messages["admin"] };

type Value = { locale: Locale; messages: ClientMessages };

const I18nContext = createContext<Value | null>(null);

export function I18nProvider({ locale, messages, children }: Value & { children: ReactNode }) {
  const value = useMemo(() => ({ locale, messages }), [locale, messages]);
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

function helpers(locale: Locale) {
  return {
    f: format,
    plural: (count: number, forms: Plural, vars?: Vars) => plural(locale, count, forms, vars),
    date: (value: Date | string | number, options?: Intl.DateTimeFormatOptions) => formatDateTime(locale, value, options),
    num: (value: number) => formatNumber(locale, value),
  };
}

/** 前台组件用：网站语言的 common + reader */
export function useI18n() {
  const value = useContext(I18nContext);
  if (!value) throw new Error("useI18n() needs <I18nProvider>");
  return { locale: value.locale, m: value.messages, ...helpers(value.locale) };
}

/** 后台组件用：管理员语言，带 admin 文案 */
export function useAdminI18n() {
  const value = useContext(I18nContext);
  const admin = value?.messages.admin;
  if (!value || !admin) throw new Error("useAdminI18n() needs the admin <I18nProvider>");
  return { locale: value.locale, m: { ...value.messages, admin }, ...helpers(value.locale) };
}
