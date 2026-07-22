import { prisma } from "@/lib/prisma";

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
        { label: "搜索", href: "/search" },
      ],
    },
    {
      title: "关于",
      links: [{ label: "管理后台", href: "/admin" }],
    },
  ],
};

export async function getSettings(): Promise<SiteSettings> {
  try {
    const row = await prisma.setting.findUnique({
      where: { key: SETTINGS_KEY },
    });
    if (!row) return defaultSettings;
    const parsed = JSON.parse(row.value) as Partial<SiteSettings>;
    return {
      ...defaultSettings,
      ...parsed,
      footerColumns: Array.isArray(parsed.footerColumns)
        ? parsed.footerColumns
        : defaultSettings.footerColumns,
    };
  } catch {
    return defaultSettings;
  }
}
