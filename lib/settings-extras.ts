/**
 * 站点设置里后加的几组：首页「从这里开始」、文章页动效、赞助与打赏。
 * 纯函数（类型、默认值、读取、校验），lib/settings.ts、设置 Server Action 和单元测试共用。
 */

export type StartHere = {
  enabled: boolean;
  title: string;
  intro: string;
  /** 要放在首页的系列（按这里的顺序）；为空时自动取最新的几个系列 */
  seriesSlugs: string[];
};

/** calm：文章页卡片不倾斜、没有聚光灯，吉祥物不跟随指针；full：和其他页面一样 */
export type ArticleMotion = "calm" | "full";

export type SupportSettings = {
  /** 打赏按钮上的文字，例如「请作者喝杯咖啡」 */
  donationText: string;
  /** 收款码图片（本站上传的 /uploads/…），两个都空时不显示打赏 */
  wechatQr: string;
  alipayQr: string;
  /** 赞助商：文字 + 链接 + 可选的图片（横幅或 logo），文字为空时不显示 */
  sponsorText: string;
  sponsorUrl: string;
  sponsorImage: string;
};

export const MAX_START_HERE_SERIES = 6;

export const defaultStartHere: StartHere = {
  enabled: true,
  title: "从这里开始",
  intro: "不知道先看哪篇？挑一个系列，从第一篇读起。",
  seriesSlugs: [],
};

export const defaultSupport: SupportSettings = {
  donationText: "",
  wechatQr: "",
  alipayQr: "",
  sponsorText: "",
  sponsorUrl: "",
  sponsorImage: "",
};

const str = (value: unknown, fallback = "") => (typeof value === "string" ? value : fallback);

/** 从存储的 JSON 读出（字段缺失或类型不对时用默认值）。 */
export function readStartHere(raw: unknown): StartHere {
  const value = (raw && typeof raw === "object" ? raw : {}) as Partial<Record<keyof StartHere, unknown>>;
  return {
    enabled: typeof value.enabled === "boolean" ? value.enabled : defaultStartHere.enabled,
    title: str(value.title, defaultStartHere.title),
    intro: str(value.intro, defaultStartHere.intro),
    seriesSlugs: Array.isArray(value.seriesSlugs)
      ? value.seriesSlugs.filter((slug): slug is string => typeof slug === "string").slice(0, MAX_START_HERE_SERIES)
      : [],
  };
}

export function readArticleMotion(raw: unknown): ArticleMotion {
  return raw === "full" ? "full" : "calm";
}

export function readSupport(raw: unknown): SupportSettings {
  const value = (raw && typeof raw === "object" ? raw : {}) as Partial<Record<keyof SupportSettings, unknown>>;
  return {
    donationText: str(value.donationText),
    wechatQr: str(value.wechatQr),
    alipayQr: str(value.alipayQr),
    sponsorText: str(value.sponsorText),
    sponsorUrl: str(value.sponsorUrl),
    sponsorImage: str(value.sponsorImage),
  };
}

/** 设置里的图片只接受本站上传目录下的文件。 */
export const UPLOAD_IMAGE_PATH = /^\/uploads\/[\w-]+\.(?:webp|png|jpe?g|gif)$/i;

/**
 * 校验后台提交的「赞助与打赏」。图片文件是否真的存在由调用方再查（需要文件系统）。
 */
export function parseSupportInput(input: Record<keyof SupportSettings, string>): { data: SupportSettings } | { error: string } {
  const data: SupportSettings = {
    donationText: input.donationText.trim().slice(0, 40),
    wechatQr: input.wechatQr.trim(),
    alipayQr: input.alipayQr.trim(),
    sponsorText: input.sponsorText.trim().slice(0, 60),
    sponsorUrl: input.sponsorUrl.trim(),
    sponsorImage: input.sponsorImage.trim(),
  };
  for (const key of ["wechatQr", "alipayQr", "sponsorImage"] as const) {
    if (data[key] && !UPLOAD_IMAGE_PATH.test(data[key])) return { error: "赞助与打赏的图片请用上传按钮上传" };
  }
  if (data.sponsorUrl && !/^(?:https?:\/\/[^\s<>"']+|\/[^\s<>"']*)$/i.test(data.sponsorUrl)) {
    return { error: "赞助链接请填写 https:// 开头的网址" };
  }
  if ((data.sponsorUrl || data.sponsorImage) && !data.sponsorText) return { error: "设置了赞助链接或图片时，请填写赞助文字" };
  return { data };
}

export function parseStartHereInput(input: { enabled: boolean; title: string; intro: string; seriesSlugs: string[] }): StartHere {
  return {
    enabled: input.enabled,
    title: input.title.trim().slice(0, 30) || defaultStartHere.title,
    intro: input.intro.trim().slice(0, 120),
    seriesSlugs: [...new Set(input.seriesSlugs.map((slug) => slug.trim()).filter((slug) => /^[\p{L}\p{N}-]{1,48}$/u.test(slug)))].slice(
      0,
      MAX_START_HERE_SERIES,
    ),
  };
}

/** 首页要展示的系列：后台选了就按选择的顺序，没选就取最新的 limit 个。 */
export function pickStartHereSeries<T extends { slug: string }>(all: T[], slugs: string[], limit = 3): T[] {
  if (slugs.length === 0) return all.slice(0, limit);
  const bySlug = new Map(all.map((item) => [item.slug, item]));
  return slugs.map((slug) => bySlug.get(slug)).filter((item): item is T => Boolean(item));
}

/** 品牌素材：都在后台上传 / 选择，站长不用改仓库里的文件（改了文件会挡住一键更新）。 */
export type BrandSettings = {
  /** Logo 图片（/uploads/…，正方形最好）；为空时用「Logo 字符」 */
  logoImage: string;
  /** 网站图标（浏览器标签、收藏、手机桌面），为空时按 Logo 文字和主题色生成（lib/site-icon.ts） */
  favicon: string;
  /** 默认分享图（首页、列表等没有配图的页面），为空时按站名自动生成 */
  shareImage: string;
  /** 主题色 #rrggbb，为空时用默认的靛蓝 */
  accentColor: string;
  /** 是否显示小幽灵吉祥物 */
  mascot: boolean;
};

export const DEFAULT_ACCENT = "#6366f1";

export const defaultBrand: BrandSettings = { logoImage: "", favicon: "", shareImage: "", accentColor: "", mascot: true };

export function readBrand(raw: unknown): BrandSettings {
  const value = (raw && typeof raw === "object" ? raw : {}) as Partial<Record<keyof BrandSettings, unknown>>;
  return {
    logoImage: str(value.logoImage),
    favicon: str(value.favicon),
    shareImage: str(value.shareImage),
    accentColor: typeof value.accentColor === "string" && /^#[0-9a-f]{6}$/i.test(value.accentColor) ? value.accentColor.toLowerCase() : "",
    mascot: typeof value.mascot === "boolean" ? value.mascot : true,
  };
}

export function parseBrandInput(input: { logoImage: string; favicon: string; shareImage: string; accentColor: string; mascot: boolean }):
  | { data: BrandSettings }
  | { error: string } {
  const data: BrandSettings = {
    logoImage: input.logoImage.trim(),
    favicon: input.favicon.trim(),
    shareImage: input.shareImage.trim(),
    accentColor: input.accentColor.trim().toLowerCase(),
    mascot: input.mascot,
  };
  for (const key of ["logoImage", "favicon", "shareImage"] as const) {
    if (data[key] && !UPLOAD_IMAGE_PATH.test(data[key])) return { error: "品牌图片请用上传按钮上传" };
  }
  if (data.accentColor === DEFAULT_ACCENT) data.accentColor = "";
  if (data.accentColor && !/^#[0-9a-f]{6}$/.test(data.accentColor)) return { error: "主题色请填写 #RRGGBB 格式，例如 #0ea5e9" };
  return { data };
}
