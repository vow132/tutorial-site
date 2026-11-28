/**
 * 换网站语言时，站长还没改过的默认文字跟着换成新语言的默认值（站名、首页文案、页脚栏目、「从这里开始」）。
 * 纯函数：只用字典里的 defaults（lib/i18n/messages/<语言>/defaults.ts），设置 Server Action 和单元测试共用。
 */

import type { Locale } from "@/lib/i18n/locales";
import { messagesFor } from "@/lib/i18n/messages";
import type { SiteSettings } from "@/lib/settings";

/** 跟着语言换的文字字段（字段名和字典 defaults 里的键相同） */
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

/** 页脚右下角状态文字的长度上限（按字计；俄语等默认文字比中文长） */
export const MAX_FOOTER_STATUS = 30;

const FOOTER_TITLE_KEYS = ["footerCategories", "footerQuickLinks", "footerAbout"] as const;
const FOOTER_LINK_KEYS = ["linkAllTutorials", "linkAllTags", "linkSearch", "linkAbout", "linkRss"] as const;

type Localizable = Pick<SiteSettings, (typeof LOCALIZED_TEXT_FIELDS)[number] | "footerColumns" | "startHere">;

/**
 * 返回换好文字的设置。页脚按每个栏目标题、每个链接文字逐条换（老版本的默认页脚栏目少几项，整体比较对不上），
 * 栏目标题和链接文字分开对照（俄语里「О сайте」既是栏目名也是链接名，换回中文分别是「关于」「关于本站」）。
 */
export function switchDefaultTexts<T extends Localizable>(settings: T, from: Locale, to: Locale): T {
  if (from === to) return settings;
  const before = messagesFor(from).defaults;
  const after = messagesFor(to).defaults;
  const next: T = { ...settings };
  for (const field of LOCALIZED_TEXT_FIELDS) {
    if (settings[field] === before[field]) next[field] = after[field];
  }
  const titles = new Map<string, string>(FOOTER_TITLE_KEYS.map((key) => [before[key], after[key]]));
  const labels = new Map<string, string>(FOOTER_LINK_KEYS.map((key) => [before[key], after[key]]));
  next.footerColumns = settings.footerColumns.map((column) => ({
    ...column,
    title: titles.get(column.title) ?? column.title,
    links: column.links.map((link) => ({ ...link, label: labels.get(link.label) ?? link.label })),
  }));
  next.startHere = {
    ...settings.startHere,
    title: settings.startHere.title === before.startHereTitle ? after.startHereTitle : settings.startHere.title,
    intro: settings.startHere.intro === before.startHereIntro ? after.startHereIntro : settings.startHere.intro,
  };
  return next;
}
