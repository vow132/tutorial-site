/**
 * 阅读来源：浏览器只上报来源网站的域名（不带路径和搜索词），这里规整成统计用的 source，
 * 仪表盘再翻译成「百度」「微信」这样的名字。纯函数，阅读上报接口和仪表盘共用。
 */

export const DIRECT = "(direct)";
export const INTERNAL = "(internal)";

/** 规整来源：去掉 www./m./wap. 前缀；本站或站内跳转记为 (internal)，没有来源记为 (direct)。 */
export function referrerSource(raw: unknown, siteHost: string | null): string {
  if (raw === INTERNAL) return INTERNAL;
  if (typeof raw !== "string" || !raw.trim()) return DIRECT;
  const host = raw.trim().toLowerCase().replace(/\.$/, "");
  if (!/^[a-z0-9-]+(\.[a-z0-9-]+)*$/.test(host) || host.length > 253) return DIRECT;
  const bare = host.replace(/^(www|m|wap|mobile)\./, "");
  const site = siteHost?.toLowerCase().replace(/^(www|m)\./, "");
  if (site && (bare === site || bare.endsWith(`.${site}`))) return INTERNAL;
  return bare;
}

type Kind = "search" | "social" | "direct" | "internal" | "site";

const KNOWN: Array<{ test: RegExp; label: string; kind: Kind }> = [
  { test: /(^|\.)baidu\.com$/, label: "百度", kind: "search" },
  { test: /(^|\.)google\.[a-z.]+$/, label: "谷歌", kind: "search" },
  { test: /(^|\.)bing\.com$/, label: "必应", kind: "search" },
  { test: /(^|\.)sogou\.com$/, label: "搜狗", kind: "search" },
  { test: /(^|\.)so\.com$/, label: "360 搜索", kind: "search" },
  { test: /(^|\.)sm\.cn$/, label: "神马搜索", kind: "search" },
  { test: /(^|\.)toutiao\.com$/, label: "头条", kind: "search" },
  { test: /(^|\.)duckduckgo\.com$/, label: "DuckDuckGo", kind: "search" },
  { test: /(^|\.)yandex\.[a-z.]+$/, label: "Yandex", kind: "search" },
  { test: /(^|\.)(weixin\.qq\.com|wx\.qq\.com)$|^com\.tencent\.mm$/, label: "微信", kind: "social" },
  { test: /(^|\.)qq\.com$|^com\.tencent\.mobileqq$/, label: "QQ", kind: "social" },
  { test: /(^|\.)weibo\.(com|cn)$/, label: "微博", kind: "social" },
  { test: /(^|\.)zhihu\.com$/, label: "知乎", kind: "social" },
  { test: /(^|\.)juejin\.cn$/, label: "掘金", kind: "social" },
  { test: /(^|\.)csdn\.net$/, label: "CSDN", kind: "social" },
  { test: /(^|\.)v2ex\.com$/, label: "V2EX", kind: "social" },
  { test: /(^|\.)github\.com$/, label: "GitHub", kind: "social" },
  { test: /(^|\.)bilibili\.com$/, label: "哔哩哔哩", kind: "social" },
  { test: /^(t\.co|x\.com|twitter\.com)$/, label: "X（Twitter）", kind: "social" },
];

/** 仪表盘上显示的名字和类别。 */
export function describeSource(source: string): { label: string; kind: Kind } {
  if (source === DIRECT) return { label: "直接访问 / 书签", kind: "direct" };
  if (source === INTERNAL) return { label: "站内跳转", kind: "internal" };
  const known = KNOWN.find((item) => item.test.test(source));
  return known ? { label: known.label, kind: known.kind } : { label: source, kind: "site" };
}

export const SOURCE_KIND_LABEL: Record<Kind, string> = {
  search: "搜索引擎",
  social: "社区 / 社交",
  direct: "直接访问",
  internal: "站内",
  site: "其他网站",
};
