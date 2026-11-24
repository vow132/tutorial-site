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
  return { success: "设置已保存，前台已生效" };
}
