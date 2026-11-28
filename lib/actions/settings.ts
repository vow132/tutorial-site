"use server";

import { revalidatePath, revalidateTag } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/admin-auth";
import { audit } from "@/lib/audit";
import { defaultSettingsFor, getSettings, SETTINGS_KEY, type SiteSettings } from "@/lib/settings";
import { MAX_FOOTER_STATUS, switchDefaultTexts } from "@/lib/locale-defaults";
import { readLocale } from "@/lib/i18n/locales";
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
import { isDemoMode } from "@/lib/demo";
import { getAdminI18n } from "@/lib/i18n/server";
import { fetchRemoteImage, RemoteImageError, remoteImageMessage } from "@/lib/remote-image";
import { SITE_URL } from "@/lib/site-url";

export type SettingsFormState = { error?: string; success?: string };


export async function updateSettings(
  _prev: SettingsFormState,
  formData: FormData
): Promise<SettingsFormState> {
  const admin = await requireAuth();
  const { m, f } = await getAdminI18n();
  const e = m.admin.settingsErrors;

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
    return { error: e.footerColumns };
  }

  const verification: SearchVerification = {};
  for (const engine of SEARCH_ENGINES) {
    const code = normalizeVerificationCode(text(`verification.${engine.key}`));
    if (code === null) {
      return { error: f(e.verification, { engine: m.admin.searchEngines[engine.key] }) };
    }
    if (code) verification[engine.key] = code;
  }

  const securityContact = normalizeSecurityContact(text("securityContact"));
  if (securityContact === null) {
    return { error: e.securityContact };
  }

  const support = parseSupportInput({
    donationText: text("support.donationText"),
    wechatQr: text("support.wechatQr"),
    alipayQr: text("support.alipayQr"),
    sponsorText: text("support.sponsorText"),
    sponsorUrl: text("support.sponsorUrl"),
    sponsorImage: text("support.sponsorImage"),
  }, e);
  if ("error" in support) return { error: support.error };
  for (const image of [support.data.wechatQr, support.data.alipayQr, support.data.sponsorImage]) {
    if (image && !(await uploadedImage(image))) return { error: e.supportMissing };
  }

  const brand = parseBrandInput({
    logoImage: text("brand.logoImage"),
    favicon: text("brand.favicon"),
    shareImage: text("brand.shareImage"),
    accentColor: text("brand.accentColor"),
    mascot: formData.get("brand.mascot") === "on",
  }, e);
  if ("error" in brand) return { error: brand.error };
  for (const image of [brand.data.logoImage, brand.data.favicon, brand.data.shareImage]) {
    if (image && !(await uploadedImage(image))) return { error: e.brandMissing };
  }

  let navLinksRaw: unknown;
  try {
    navLinksRaw = JSON.parse(text("navLinks.links") || "[]");
  } catch {
    return { error: e.navFormat };
  }
  const navLinks = parseNavLinksInput({ position: text("navLinks.position"), links: navLinksRaw }, e);
  if ("error" in navLinks) return { error: navLinks.error };

  const assetHost = parseAssetHost(text("assetHost"), e);
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
  }, e);
  if ("error" in comments) return { error: comments.error };

  const startHere = parseStartHereInput({
    enabled: formData.get("startHere.enabled") === "on",
    title: text("startHere.title"),
    intro: text("startHere.intro"),
    seriesSlugs: formData.getAll("startHere.series").map(String),
  });

  const previous = await getSettings();
  const locale = readLocale(text("locale"), previous.locale);
  const fresh = defaultSettingsFor(locale);
  let settings: SiteSettings = {
    locale,
    siteName: text("siteName") || fresh.siteName,
    logoText: text("logoText") || fresh.logoText,
    siteTitle: text("siteTitle") || fresh.siteTitle,
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
    footerStatus: Array.from(text("footerStatus")).slice(0, MAX_FOOTER_STATUS).join(""),
    navLinks: navLinks.data,
    assetHost: assetHost.value,
    comments: comments.data,
    antiScrape: {
      blockAiCrawlers: formData.get("antiScrape.blockAiCrawlers") === "on",
      copyAttribution: formData.get("antiScrape.copyAttribution") === "on",
    },
  };

  if (!settings.siteTitle) return { error: e.siteTitle };
  // 换了网站语言：还是旧语言默认值（站长没改过）的文字一起换成新语言的默认值（lib/locale-defaults.ts）
  settings = switchDefaultTexts(settings, previous.locale, locale);

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
  return { success: e.saved };
}

export type AssetHostTestResult = { ok: boolean; message: string };

/**
 * 测试图片加速地址：通过它取一张本站已经上传的图片，和本站的文件比对。
 * 用防 SSRF 的下载（lib/remote-image.ts）：只连公网地址，不能借这里探测服务器内网。
 */
export async function testAssetHost(raw: string): Promise<AssetHostTestResult> {
  const { m, f } = await getAdminI18n();
  const e = m.admin.settingsErrors;
  if (isDemoMode()) return { ok: false, message: m.admin.demoReadOnly };
  await requireAuth();
  const parsed = parseAssetHost(raw, e);
  if ("error" in parsed) return { ok: false, message: parsed.error };
  if (!parsed.value) return { ok: false, message: e.assetHostEmpty };

  const dir = path.join(process.cwd(), "public", "uploads");
  const sample = (await readdir(dir).catch(() => [] as string[])).find((name) => /^[\w-]+\.(?:webp|png|jpe?g|gif)$/i.test(name));
  if (!sample) return { ok: false, message: e.noUploads };
  const url = `${parsed.value}/uploads/${sample}`;
  try {
    const [remote, local] = await Promise.all([fetchRemoteImage(url, { timeoutMs: 15_000 }), readFile(path.join(dir, sample))]);
    if (!remote.equals(local)) {
      return {
        ok: true,
        message: f(e.assetDiffers, { url }),
      };
    }
    return { ok: true, message: f(e.assetOk, { name: sample }) };
  } catch (error) {
    const reason = error instanceof RemoteImageError ? remoteImageMessage(error, m) : e.connectFailed;
    return { ok: false, message: f(e.assetFailed, { url, reason, site: SITE_URL }) };
  }
}
