/**
 * 阅读来源：浏览器只上报来源网站的域名（不带路径和搜索词），这里规整成统计用的 source，
 * 仪表盘再翻译成「百度」「微信」这样的名字。纯函数，阅读上报接口和仪表盘共用。
 */

import type { Messages } from "@/lib/i18n/messages";

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

/** 仪表盘上的名字：有 name 的按后台语言翻译（m.admin.referrer.names），没有的是品牌名原样显示 */
type Names = Messages["admin"]["referrer"]["names"];

const KNOWN: Array<{ test: RegExp; label: string; name?: keyof Names; kind: Kind }> = [
  { test: /(^|\.)baidu\.com$/, label: "Baidu", name: "baidu", kind: "search" },
  { test: /(^|\.)google\.[a-z.]+$/, label: "Google", name: "google", kind: "search" },
  { test: /(^|\.)bing\.com$/, label: "Bing", name: "bing", kind: "search" },
  { test: /(^|\.)sogou\.com$/, label: "Sogou", name: "sogou", kind: "search" },
  { test: /(^|\.)so\.com$/, label: "360 Search", name: "so360", kind: "search" },
  { test: /(^|\.)sm\.cn$/, label: "Shenma", name: "shenma", kind: "search" },
  { test: /(^|\.)toutiao\.com$/, label: "Toutiao", name: "toutiao", kind: "search" },
  { test: /(^|\.)duckduckgo\.com$/, label: "DuckDuckGo", kind: "search" },
  { test: /(^|\.)yandex\.[a-z.]+$/, label: "Yandex", kind: "search" },
  { test: /(^|\.)(weixin\.qq\.com|wx\.qq\.com)$|^com\.tencent\.mm$/, label: "WeChat", name: "wechat", kind: "social" },
  { test: /(^|\.)qq\.com$|^com\.tencent\.mobileqq$/, label: "QQ", kind: "social" },
  { test: /(^|\.)weibo\.(com|cn)$/, label: "Weibo", name: "weibo", kind: "social" },
  { test: /(^|\.)zhihu\.com$/, label: "Zhihu", name: "zhihu", kind: "social" },
  { test: /(^|\.)juejin\.cn$/, label: "Juejin", name: "juejin", kind: "social" },
  { test: /(^|\.)csdn\.net$/, label: "CSDN", kind: "social" },
  { test: /(^|\.)v2ex\.com$/, label: "V2EX", kind: "social" },
  { test: /(^|\.)github\.com$/, label: "GitHub", kind: "social" },
  { test: /(^|\.)bilibili\.com$/, label: "Bilibili", name: "bilibili", kind: "social" },
  { test: /^(t\.co|x\.com|twitter\.com)$/, label: "X (Twitter)", name: "x", kind: "social" },
];

/** 仪表盘上显示的名字和类别（t = m.admin.referrer，类别名在 t.kinds）。 */
export function describeSource(source: string, t: Messages["admin"]["referrer"]): { label: string; kind: Kind } {
  if (source === DIRECT) return { label: t.direct, kind: "direct" };
  if (source === INTERNAL) return { label: t.internal, kind: "internal" };
  const known = KNOWN.find((item) => item.test.test(source));
  if (!known) return { label: source, kind: "site" };
  return { label: known.name ? t.names[known.name] : known.label, kind: known.kind };
}
