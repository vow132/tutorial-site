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
import { defaultSettings, SETTINGS_KEY } from "@/lib/settings";
import { setupCodeMatches } from "@/lib/setup-code.mjs";

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

  const ip = await getClientIp();
  if ((ip && limiters.ip.retryAfter(ip) > 0) || limiters.global.retryAfter("all") > 0) {
    return { error: "尝试次数过多，请一小时后再试" };
  }
  if (!setupCodeMatches(formData.get("code"))) {
    if (ip) limiters.ip.hit(ip);
    limiters.global.hit("all");
    await audit("setup.failed", { detail: "安装码不正确" });
    return { error: "安装码不对。请看服务器的启动日志，或在服务器上运行 npm run setup:code" };
  }

  const siteName = String(formData.get("siteName") ?? "").replace(/\s+/g, " ").trim();
  const username = String(formData.get("username") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const confirm = String(formData.get("confirm") ?? "");
  const keepSamples = formData.get("keepSamples") === "on";
  if (!siteName) return { error: "请填写站点名称" };
  if (Array.from(siteName).length > 30) return { error: "站点名称最多 30 个字" };
  if (!USERNAME_PATTERN.test(username)) return { error: "用户名要 3-32 位字母、数字、下划线或连字符" };
  const problem = passwordProblem(password, username);
  if (problem) return { error: problem };
  if (password !== confirm) return { error: "两次输入的密码不一样" };

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
  const next: Record<string, unknown> = { ...stored, siteName };
  if (!stored.siteTitle || stored.siteTitle === defaultSettings.siteTitle) next.siteTitle = siteName;
  if (!stored.logoText || stored.logoText === defaultSettings.logoText) next.logoText = Array.from(siteName)[0];
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
