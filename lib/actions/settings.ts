"use server";

import { revalidatePath, revalidateTag } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/admin-auth";
import { audit } from "@/lib/audit";
import { SETTINGS_KEY, type SiteSettings } from "@/lib/settings";
import { CACHE_TAGS } from "@/lib/public-data";
import {
  SEARCH_ENGINES,
  normalizeVerificationCode,
  type SearchVerification,
} from "@/lib/search-verification";
import { normalizeSecurityContact } from "@/lib/security-txt";
import { parseBrandInput, parseNavLinksInput, parseStartHereInput, parseSupportInput } from "@/lib/settings-extras";
import { uploadedImage } from "@/lib/article";
import { parseAssetHost } from "@/lib/asset-url";
import { parseCommentsInput } from "@/lib/comments";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { DEMO_READ_ONLY_MESSAGE, isDemoMode } from "@/lib/demo";
import { fetchRemoteImage, RemoteImageError } from "@/lib/remote-image";
import { SITE_URL } from "@/lib/site-url";

export type SettingsFormState = { error?: string; success?: string };


export async function updateSettings(
  _prev: SettingsFormState,
  formData: FormData
): Promise<SettingsFormState> {
  const admin = await requireAuth();

  const text = (key: string) => String(formData.get(key) ?? "").trim();

  let footerColumns: SiteSettings["footerColumns"];
  try {
    const raw = text("footerColumns");
    footerColumns = JSON.parse(raw);
    if (!Array.isArray(footerColumns)) throw new Error();
    for (const col of footerColumns) {
      if (typeof col.title !== "string" || !Array.isArray(col.links)) {
        throw new Error();
      }
      // href 只允许站内路径与常见安全协议，堵住 javascript: 注入
      for (const link of col.links) {
        if (
          typeof link.label !== "string" ||
          typeof link.href !== "string" ||
          !/^(?:\/|#|https?:\/\/|mailto:)/i.test(link.href)
        ) {
          throw new Error();
        }
      }
    }
  } catch {
    return { error: "底部栏目数据格式有误" };
  }

  const verification: SearchVerification = {};
  for (const engine of SEARCH_ENGINES) {
    const code = normalizeVerificationCode(text(`verification.${engine.key}`));
    if (code === null) {
      return { error: `${engine.label}的验证码格式不对：请填写验证码，或粘贴平台给的整段 meta 标签` };
    }
    if (code) verification[engine.key] = code;
  }

  const securityContact = normalizeSecurityContact(text("securityContact"));
  if (securityContact === null) {
    return { error: "安全联系方式请填写邮箱，或 https:// 开头的网址" };
  }

  const support = parseSupportInput({
    donationText: text("support.donationText"),
    wechatQr: text("support.wechatQr"),
    alipayQr: text("support.alipayQr"),
    sponsorText: text("support.sponsorText"),
    sponsorUrl: text("support.sponsorUrl"),
    sponsorImage: text("support.sponsorImage"),
  });
  if ("error" in support) return { error: support.error };
  for (const image of [support.data.wechatQr, support.data.alipayQr, support.data.sponsorImage]) {
    if (image && !(await uploadedImage(image))) return { error: "赞助与打赏里的图片文件已不存在，请重新上传" };
  }

  const brand = parseBrandInput({
    logoImage: text("brand.logoImage"),
    favicon: text("brand.favicon"),
    shareImage: text("brand.shareImage"),
    accentColor: text("brand.accentColor"),
    mascot: formData.get("brand.mascot") === "on",
  });
  if ("error" in brand) return { error: brand.error };
  for (const image of [brand.data.logoImage, brand.data.favicon, brand.data.shareImage]) {
    if (image && !(await uploadedImage(image))) return { error: "品牌里的图片文件已不存在，请重新上传" };
  }

  let navLinksRaw: unknown;
  try {
    navLinksRaw = JSON.parse(text("navLinks.links") || "[]");
  } catch {
    return { error: "导航链接数据格式有误" };
  }
  const navLinks = parseNavLinksInput({ position: text("navLinks.position"), links: navLinksRaw });
  if ("error" in navLinks) return { error: navLinks.error };

  const assetHost = parseAssetHost(text("assetHost"));
  if ("error" in assetHost) return { error: assetHost.error };

  const comments = parseCommentsInput({
    provider: text("comments.provider") || "none",
    server: text("comments.server"),
    site: text("comments.site"),
    repo: text("comments.repo"),
    repoId: text("comments.repoId"),
    category: text("comments.category"),
    categoryId: text("comments.categoryId"),
    cdn: text("comments.cdn"),
  });
  if ("error" in comments) return { error: comments.error };

  const startHere = parseStartHereInput({
    enabled: formData.get("startHere.enabled") === "on",
    title: text("startHere.title"),
    intro: text("startHere.intro"),
    seriesSlugs: formData.getAll("startHere.series").map(String),
  });

  const settings: SiteSettings = {
    siteName: text("siteName") || "教程网",
    logoText: text("logoText") || "教",
    siteTitle: text("siteTitle") || "教程网",
    siteDescription: text("siteDescription"),
    heroBadge: text("heroBadge"),
    heroTitleA: text("heroTitleA"),
    heroTitleB: text("heroTitleB"),
    heroAccent: text("heroAccent"),
    heroSubtitle: text("heroSubtitle"),
    footerTagline: text("footerTagline"),
    copyright: text("copyright"),
    footerColumns,
    verification,
    securityContact,
    startHere,
    articleMotion: formData.get("articleMotion") === "full" ? "full" : "calm",
    support: support.data,
    brand: brand.data,
    footerStatus: text("footerStatus").slice(0, 20),
    navLinks: navLinks.data,
    assetHost: assetHost.value,
    comments: comments.data,
    antiScrape: {
      blockAiCrawlers: formData.get("antiScrape.blockAiCrawlers") === "on",
      copyAttribution: formData.get("antiScrape.copyAttribution") === "on",
    },
  };

  if (!settings.siteTitle) return { error: "网站标题不能为空" };

  await prisma.setting.upsert({
    where: { key: SETTINGS_KEY },
    update: { value: JSON.stringify(settings) },
    create: { key: SETTINGS_KEY, value: JSON.stringify(settings) },
  });

  await audit("settings.update", { actor: admin.username });
  revalidateTag(CACHE_TAGS.settings, { expire: 0 });
  revalidatePath("/", "layout");
  // robots.txt 是单独的路由，不在根布局下面（「拒绝 AI 训练爬虫」开关要马上生效）
  revalidatePath("/robots.txt");
  return { success: "设置已保存，前台已生效" };
}

export type AssetHostTestResult = { ok: boolean; message: string };

/**
 * 测试图片加速地址：通过它取一张本站已经上传的图片，和本站的文件比对。
 * 用防 SSRF 的下载（lib/remote-image.ts）：只连公网地址，不能借这里探测服务器内网。
 */
export async function testAssetHost(raw: string): Promise<AssetHostTestResult> {
  if (isDemoMode()) return { ok: false, message: DEMO_READ_ONLY_MESSAGE };
  await requireAuth();
  const parsed = parseAssetHost(raw);
  if ("error" in parsed) return { ok: false, message: parsed.error };
  if (!parsed.value) return { ok: false, message: "先填写图片加速地址" };

  const dir = path.join(process.cwd(), "public", "uploads");
  const sample = (await readdir(dir).catch(() => [] as string[])).find((name) => /^[\w-]+\.(?:webp|png|jpe?g|gif)$/i.test(name));
  if (!sample) return { ok: false, message: "还没有上传过图片：先在后台上传一张图片再测试" };
  const url = `${parsed.value}/uploads/${sample}`;
  try {
    const [remote, local] = await Promise.all([fetchRemoteImage(url, { timeoutMs: 15_000 }), readFile(path.join(dir, sample))]);
    if (!remote.equals(local)) {
      return {
        ok: true,
        message: `能取到图片，但和本站的文件不完全一样（CDN 可能做了压缩或格式转换）。确认 ${url} 显示正常的话就可以用。`,
      };
    }
    return { ok: true, message: `可以用：通过加速地址取到的 ${sample} 和本站完全一致。保存设置后前台生效。` };
  } catch (error) {
    const reason = error instanceof RemoteImageError ? error.message : "连接失败";
    return {
      ok: false,
      message: `通过 ${url} 取图失败（${reason}）。请检查：回源地址是不是本站（${SITE_URL}）；开了防盗链的话把本站域名加进白名单。`,
    };
  }
}
