import { cache } from "react";
import { unstable_cache } from "next/cache";
import { prisma } from "@/lib/prisma";
import { CACHE_TAGS, SLOW_REVALIDATE_SECONDS } from "@/lib/public-data";
import { readVerification, type SearchVerification } from "@/lib/search-verification";
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
};

export const SETTINGS_KEY = "site";

export const defaultSettings: SiteSettings = {
  siteName: "教程网",
  logoText: "教",
  siteTitle: "教程网 · 高质量图文教程",
  siteDescription:
    "用简洁的方式，交付可靠的知识。前端、后端、数据库、运维与设计的实战图文教程。",
  heroBadge: "持续更新的知识库",
  heroTitleA: "把复杂的知识",
  heroTitleB: "讲得",
  heroAccent: "简单明白",
  heroSubtitle:
    "前端、后端、数据库、运维与设计——每一篇教程都经过精心编排，拒绝废话，直达核心。",
  footerTagline: "用简洁的方式，交付可靠的知识。持续更新高质量图文教程。",
  copyright: "教程网 · 用心写好每一篇教程",
  footerColumns: [
    { title: "教程分类", autoCategories: true, links: [] },
    {
      title: "快速入口",
      links: [
        { label: "全部教程", href: "/tutorials" },
        { label: "全部标签", href: "/tags" },
        { label: "搜索", href: "/search" },
      ],
    },
    {
      title: "关于",
      links: [
        { label: "关于本站", href: "/about" },
        { label: "RSS 订阅", href: "/feed.xml" },
      ],
    },
  ],
  verification: {},
  securityContact: "",
  startHere: defaultStartHere,
  articleMotion: "calm",
  support: defaultSupport,
  brand: defaultBrand,
  footerStatus: "持续更新中",
  navLinks: defaultNavLinks,
};

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
    return {
      ...defaultSettings,
      ...parsed,
      footerColumns: Array.isArray(parsed.footerColumns)
        ? parsed.footerColumns
        : defaultSettings.footerColumns,
      verification: readVerification(parsed.verification),
      securityContact: typeof parsed.securityContact === "string" ? parsed.securityContact : "",
      startHere: readStartHere(parsed.startHere),
      articleMotion: readArticleMotion(parsed.articleMotion),
      support: readSupport(parsed.support),
      brand: readBrand(parsed.brand),
      footerStatus: typeof parsed.footerStatus === "string" ? parsed.footerStatus : defaultSettings.footerStatus,
      navLinks: readNavLinks(parsed.navLinks),
    };
  } catch {
    return defaultSettings;
  }
});