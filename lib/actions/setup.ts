"use server";

import bcrypt from "bcryptjs";
import { revalidatePath, revalidateTag } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { rememberDevice, startAdminSession } from "@/lib/admin-auth";
import { audit } from "@/lib/audit";
import { getClientIp } from "@/lib/client-ip";
import { passwordProblem } from "@/lib/password-policy";
import { CACHE_TAGS } from "@/lib/public-data";
import { sharedLimiter } from "@/lib/rate-limit";
import { revalidatePublic } from "@/lib/revalidate-public";
import { USERNAME_PATTERN } from "@/lib/roles";
import { removeSampleData } from "@/lib/sample-data-remove";
import { isDefaultText, SETTINGS_KEY } from "@/lib/settings";
import { setupCodeMatches } from "@/lib/setup-code.mjs";
import { getSetupLocale, i18nFor } from "@/lib/i18n/server";
import { readLocale } from "@/lib/i18n/locales";

export type SetupState = { error?: string };

const HOUR_MS = 60 * 60 * 1000;
/** 猜安装码：每个 IP 每小时 10 次，全站每小时 50 次（安装码约 40 位熵，这个速度猜不中）。 */
const limiters = {
  ip: sharedLimiter("setup:ip", 10, HOUR_MS, 10_000),
  global: sharedLimiter("setup:global", 50, HOUR_MS, 1),
};

/**
 * 首次安装（/admin/setup）：还没有任何后台账号时，凭服务器日志里的安装码（lib/setup-code.mjs）
 * 设置站名并创建站长账号，然后直接登录进后台。装好以后这个 action 和安装页都不再可用。
 */
export async function completeSetup(_prev: SetupState, formData: FormData): Promise<SetupState> {
  if ((await prisma.admin.count()) > 0) redirect("/admin/login");
  // 提示用安装页当前的语言；表单里选的语言就是网站语言
  const setupLocale = await getSetupLocale();
  const locale = readLocale(formData.get("locale"), setupLocale);
  const { m } = i18nFor(setupLocale);
  const t = m.admin.setup;

  const ip = await getClientIp();
  if ((ip && limiters.ip.retryAfter(ip) > 0) || limiters.global.retryAfter("all") > 0) {
    return { error: t.tooMany };
  }
  if (!setupCodeMatches(formData.get("code"))) {
    if (ip) limiters.ip.hit(ip);
    limiters.global.hit("all");
    await audit("setup.failed", { detail: "安装码不正确" });
    return { error: t.wrongCode };
  }

  const siteName = String(formData.get("siteName") ?? "").replace(/\s+/g, " ").trim();
  const username = String(formData.get("username") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const confirm = String(formData.get("confirm") ?? "");
  const keepSamples = formData.get("keepSamples") === "on";
  if (!siteName) return { error: t.siteNameRequired };
  if (Array.from(siteName).length > 30) return { error: t.siteNameTooLong };
  if (!USERNAME_PATTERN.test(username)) return { error: t.badUsername };
  const problem = passwordProblem(password, username, m.admin.password);
  if (problem) return { error: problem };
  if (password !== confirm) return { error: t.passwordMismatch };

  const hash = await bcrypt.hash(password, 12);
  // 两个人同时提交时只有一个能建成（另一个看到已经有账号了，回到登录页）
  const created = await prisma.$transaction(async (tx) => {
    if ((await tx.admin.count()) > 0) return null;
    return tx.admin.create({ data: { username, role: "owner", password: hash } });
  });
  if (!created) redirect("/admin/login");

  // 站名；网站标题和 Logo 字符还是默认值时一起换成新站名，免得前台还显示「教程网」
  const row = await prisma.setting.findUnique({ where: { key: SETTINGS_KEY } });
  let stored: Record<string, unknown> = {};
  try {
    stored = row ? (JSON.parse(row.value) as Record<string, unknown>) : {};
  } catch {
    stored = {};
  }
  // 网站语言：其他还没设置过的文字（首页标语、页脚……）都用这个语言的默认值
  const next: Record<string, unknown> = { ...stored, siteName, locale };
  if (typeof stored.siteTitle !== "string" || isDefaultText("siteTitle", stored.siteTitle)) next.siteTitle = siteName;
  if (typeof stored.logoText !== "string" || isDefaultText("logoText", stored.logoText)) next.logoText = Array.from(siteName)[0];
  await prisma.setting.upsert({
    where: { key: SETTINGS_KEY },
    update: { value: JSON.stringify(next) },
    create: { key: SETTINGS_KEY, value: JSON.stringify(next) },
  });

  const removed = keepSamples ? null : await removeSampleData();
  // 部署时还没有账号，种子数据里的示例教程没有作者：交给新站长
  await prisma.tutorial.updateMany({ where: { authorId: null }, data: { authorId: created.id } });

  await startAdminSession(created);
  await rememberDevice(created.username);
  await audit("setup.complete", {
    actor: created.username,
    detail: `站名「${siteName}」${removed ? `，删除了${removed.summary}` : ""}`,
  });
  revalidateTag(CACHE_TAGS.settings, { expire: 0 });
  revalidateTag(CACHE_TAGS.categories, { expire: 0 });
  revalidatePublic(...(removed?.slugs ?? []));
  revalidatePath("/", "layout");
  redirect("/admin?welcome=1");
}
