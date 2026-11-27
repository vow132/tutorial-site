"use server";

import { cookies } from "next/headers";
import { cookieOptions } from "@/lib/admin-auth";
import { ADMIN_LOCALE_COOKIE, isLocale } from "@/lib/i18n/locales";

const ONE_YEAR = 365 * 24 * 60 * 60;

/**
 * 管理员自己的后台界面语言（Cookie，只在 /admin 下发送）。登录页、首次安装页也能选，所以不要求登录：
 * 只写一个界面语言的 Cookie，不碰任何数据。
 */
export async function setAdminLocale(locale: string) {
  if (!isLocale(locale)) return;
  (await cookies()).set(ADMIN_LOCALE_COOKIE, locale, await cookieOptions(ONE_YEAR, "/admin"));
}
