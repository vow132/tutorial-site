import { createHash } from "node:crypto";

/**
 * 文章分享图（OpenGraph / Twitter 卡片）：没有封面的文章用标题 + 分类自动生成一张图，
 * 地址带内容版本号：标题、分类或站名改了，地址随之变化，社交平台和 CDN 不会继续用旧图。
 */
export const SHARE_IMAGE_SIZE = { width: 1200, height: 630 } as const;

/** 模板改版时加一，让所有旧图地址失效。 */
const TEMPLATE_VERSION = "2";

export type ShareCard = {
  title: string;
  categoryName: string;
  categoryColor: string;
  siteName: string;
  logoText: string;
  /** 站点主题色（Logo 方块、光晕、右下角文字），默认靛蓝 */
  accent?: string;
  /** 右下角的引导文字，默认「阅读教程 →」 */
  cta?: string;
};

export function shareImageVersion(card: ShareCard) {
  return createHash("sha256")
    .update(
      JSON.stringify([
        TEMPLATE_VERSION,
        card.title,
        card.categoryName,
        card.categoryColor,
        card.siteName,
        card.logoText,
        card.accent ?? "",
        card.cta ?? "",
      ]),
    )
    .digest("base64url")
    .slice(0, 12);
}

export function shareImagePath(tutorialId: number, card: ShareCard) {
  return `/og/tutorials/${tutorialId}?v=${shareImageVersion(card)}`;
}

type SiteCardSource = {
  siteName: string;
  logoText: string;
  siteTitle: string;
  heroBadge: string;
  heroTitleA: string;
  heroTitleB: string;
  heroAccent: string;
  brand: { accentColor: string };
};

/** 首页、列表页等没有配图时的分享图内容：首页大标题 + 徽标文字，按站点主题色绘制。cta 是网站语言的「访问网站 →」 */
export function siteShareCard(settings: SiteCardSource, cta = "访问网站 →"): ShareCard {
  const accent = settings.brand.accentColor || "#6366f1";
  const hero = `${settings.heroTitleA}${settings.heroTitleB}${settings.heroAccent}`.trim();
  return {
    title: hero || settings.siteTitle,
    categoryName: settings.heroBadge || settings.siteName,
    categoryColor: accent,
    siteName: settings.siteName,
    logoText: settings.logoText,
    accent,
    cta,
  };
}

export function siteShareImagePath(card: ShareCard) {
  return `/og/site?v=${shareImageVersion(card)}`;
}

/** 只留字体里有的字符（emoji、生僻字略去），并合并多余空白。 */
export function keepDrawable(text: string, covered: Set<number>) {
  return Array.from(text)
    .map((char) => (/\s/.test(char) ? " " : covered.has(char.codePointAt(0)!) ? char : ""))
    .join("")
    .replace(/\s+/g, " ")
    .replace(/ (?=[，。、；：！？）》」』】…])/g, "")
    .trim();
}

/** 按字宽估算（汉字 1，其他约 0.55）选字号，太长的标题截断，保证最多三行。 */
export function titleLayout(title: string) {
  const width = (text: string) => Array.from(text).reduce((sum, char) => sum + (char.charCodeAt(0) > 0x2e80 ? 1 : 0.55), 0);
  const units = width(title);
  if (units <= 13) return { fontSize: 76, text: title };
  if (units <= 30) return { fontSize: 64, text: title };
  if (units <= 54) return { fontSize: 54, text: title };
  let text = "";
  for (const char of Array.from(title)) {
    if (width(text + char) > 52) break;
    text += char;
  }
  return { fontSize: 54, text: `${text.trimEnd()}…` };
}
