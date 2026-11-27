import { cache } from "react";
import { unstable_cache } from "next/cache";
import { prisma } from "@/lib/prisma";
import { CACHE_TAGS, SLOW_REVALIDATE_SECONDS } from "@/lib/public-data";
import { readVerification, type SearchVerification } from "@/lib/search-verification";
import { readAssetHost } from "@/lib/asset-url";
import { defaultComments, readComments, type CommentsSettings } from "@/lib/comments";
import { defaultAntiScrape, readAntiScrape, type AntiScrapeSettings } from "@/lib/anti-scrape";
import { DEFAULT_LOCALE, LOCALES, readLocale, type Locale } from "@/lib/i18n/locales";
import { messagesFor } from "@/lib/i18n/messages";
import {
  defaultBrand,
  defaultNavLinks,
  defaultStartHere,
  defaultSupport,
  readArticleMotion,
  readBrand,
  readNavLinks,
  readStartHere,
  readSupport,
  type ArticleMotion,
  type BrandSettings,
  type NavLinks,
  type StartHere,
  type SupportSettings,
} from "@/lib/settings-extras";

export type FooterLink = { label: string; href: string };
export type FooterColumn = {
  title: string;
  /** 设为 true 时自动输出全部分类链接，忽略 links */
  autoCategories?: boolean;
  links: FooterLink[];
};

export type SiteSettings = {
  /** 网站语言：前台界面用这个语言显示，也是后台的默认语言（lib/i18n） */
  locale: Locale;
  // 基本信息
  siteName: string;
  logoText: string;
  siteTitle: string;
  siteDescription: string;
  // 首页 Hero
  heroBadge: string;
  heroTitleA: string;
  heroTitleB: string;
  heroAccent: string;
  heroSubtitle: string;
  // 页脚
  footerTagline: string;
  copyright: string;
  footerColumns: FooterColumn[];
  // 搜索引擎站长平台的 HTML 标签验证码
  verification: SearchVerification;
  /** 安全问题联系方式（mailto: 或 https:），用于 /.well-known/security.txt；空串表示不提供 */
  securityContact: string;
  /** 首页「从这里开始」（lib/settings-extras.ts） */
  startHere: StartHere;
  /** 文章页动效：calm 时不倾斜、不跟随 */
  articleMotion: ArticleMotion;
  /** 文末的赞助与打赏 */
  support: SupportSettings;
  /** 品牌素材：Logo 图片、网站图标、默认分享图、主题色、吉祥物 */
  brand: BrandSettings;
  /** 页脚右下角的状态文字，空串表示不显示 */
  footerStatus: string;
  /** 顶部导航里分类之外的链接 */
  navLinks: NavLinks;
  /** 图片加速地址（CDN / 对象存储），空串表示不加速（lib/asset-url.ts） */
  assetHost: string;
  /** 第三方评论，默认关闭（lib/comments.ts） */
  comments: CommentsSettings;
  /** 防爬：拒绝 AI 训练爬虫、复制时附上来源，默认都关闭（lib/anti-scrape.ts） */
  antiScrape: AntiScrapeSettings;
};

export const SETTINGS_KEY = "site";

/** 某个语言的默认设置：文字取自字典的 defaults（lib/i18n/messages/<语言>/defaults.ts）。 */
export function defaultSettingsFor(locale: Locale): SiteSettings {
  const d = messagesFor(locale).defaults;
  return {
    locale,
    siteName: d.siteName,
    logoText: d.logoText,
    siteTitle: d.siteTitle,
    siteDescription: d.siteDescription,
    heroBadge: d.heroBadge,
    heroTitleA: d.heroTitleA,
    heroTitleB: d.heroTitleB,
    heroAccent: d.heroAccent,
    heroSubtitle: d.heroSubtitle,
    footerTagline: d.footerTagline,
    copyright: d.copyright,
    footerColumns: [
      { title: d.footerCategories, autoCategories: true, links: [] },
      {
        title: d.footerQuickLinks,
        links: [
          { label: d.linkAllTutorials, href: "/tutorials" },
          { label: d.linkAllTags, href: "/tags" },
          { label: d.linkSearch, href: "/search" },
        ],
      },
      {
        title: d.footerAbout,
        links: [
          { label: d.linkAbout, href: "/about" },
          { label: d.linkRss, href: "/feed.xml" },
        ],
      },
    ],
    verification: {},
    securityContact: "",
    startHere: { ...defaultStartHere, title: d.startHereTitle, intro: d.startHereIntro },
    articleMotion: "calm",
    support: defaultSupport,
    brand: defaultBrand,
    footerStatus: d.footerStatus,
    navLinks: defaultNavLinks,
    assetHost: "",
    comments: defaultComments,
    antiScrape: defaultAntiScrape,
  };
}

export const defaultSettings: SiteSettings = defaultSettingsFor(DEFAULT_LOCALE);

/** 换网站语言时会跟着换成新语言默认值的文字字段（还是旧语言默认值、站长没改过的才换） */
export const LOCALIZED_TEXT_FIELDS = [
  "siteName",
  "logoText",
  "siteTitle",
  "siteDescription",
  "heroBadge",
  "heroTitleA",
  "heroTitleB",
  "heroAccent",
  "heroSubtitle",
  "footerTagline",
  "copyright",
  "footerStatus",
] as const;

/** 这个值是不是某种语言的默认文字（站长还没改过） */
export function isDefaultText(field: (typeof LOCALIZED_TEXT_FIELDS)[number], value: string): boolean {
  return LOCALES.some((locale) => defaultSettingsFor(locale)[field] === value);
}

/** 设置几乎不变却每个页面都要读，缓存原始 JSON；后台保存时按标签失效。 */
const cachedSettingsValue = unstable_cache(
  async () =>
    (await prisma.setting.findUnique({ where: { key: SETTINGS_KEY } }))?.value ?? null,
  ["site-settings"],
  { tags: [CACHE_TAGS.settings], revalidate: SLOW_REVALIDATE_SECONDS },
);

export const getSettings = cache(async function getSettings(): Promise<SiteSettings> {
  try {
    // 查询失败会抛出、不会被缓存；兜底默认值只在这一次请求里生效。
    const value = await cachedSettingsValue();
    if (!value) return defaultSettings;
    const parsed = JSON.parse(value) as Partial<SiteSettings>;
    const locale = readLocale(parsed.locale);
    const base = defaultSettingsFor(locale);
    return {
      ...base,
      ...parsed,
      locale,
      footerColumns: Array.isArray(parsed.footerColumns)
        ? parsed.footerColumns
        : base.footerColumns,
      verification: readVerification(parsed.verification),
      securityContact: typeof parsed.securityContact === "string" ? parsed.securityContact : "",
      startHere: readStartHere(parsed.startHere, base.startHere),
      articleMotion: readArticleMotion(parsed.articleMotion),
      support: readSupport(parsed.support),
      brand: readBrand(parsed.brand),
      footerStatus: typeof parsed.footerStatus === "string" ? parsed.footerStatus : base.footerStatus,
      navLinks: readNavLinks(parsed.navLinks),
      assetHost: readAssetHost(parsed.assetHost),
      comments: readComments(parsed.comments),
      antiScrape: readAntiScrape(parsed.antiScrape),
    };
  } catch {
    return defaultSettings;
  }
});