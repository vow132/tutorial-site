import type { Metadata } from "next";

/** 支持的搜索引擎站长平台：key 存在设置 JSON 里，meta 是各平台要求的 meta name。 */
export const SEARCH_ENGINES = [
  { key: "google", label: "Google Search Console", meta: "google-site-verification" },
  { key: "bing", label: "Bing 网站管理员工具", meta: "msvalidate.01" },
  { key: "baidu", label: "百度搜索资源平台", meta: "baidu-site-verification" },
  { key: "so360", label: "360 站长平台", meta: "360-site-verification" },
  { key: "sogou", label: "搜狗站长平台", meta: "sogou_site_verification" },
  { key: "shenma", label: "神马站长平台", meta: "shenma-site-verification" },
  { key: "yandex", label: "Yandex Webmaster", meta: "yandex-verification" },
] as const;

export type SearchEngineKey = (typeof SEARCH_ENGINES)[number]["key"];
export type SearchVerification = Partial<Record<SearchEngineKey, string>>;

const CODE = /^[A-Za-z0-9_\-.:=+/]{1,200}$/;

/**
 * 规范化站长平台给的验证码。可以只填验证码，也可以直接粘贴平台给的整段
 * `<meta name="…" content="…">`，这里会取出 content。
 * 返回 "" 表示清空；返回 null 表示格式不对。
 */
export function normalizeVerificationCode(input: string): string | null {
  const raw = input.trim();
  if (!raw) return "";
  const fromTag = /content\s*=\s*["']([^"']*)["']/i.exec(raw)?.[1];
  const code = (fromTag ?? raw).trim();
  return CODE.test(code) ? code : null;
}

/** 从设置 JSON 里读出验证码：只保留已知平台的合法字符串，坏数据直接忽略。 */
export function readVerification(value: unknown): SearchVerification {
  if (!value || typeof value !== "object") return {};
  const result: SearchVerification = {};
  for (const { key } of SEARCH_ENGINES) {
    const code = (value as Record<string, unknown>)[key];
    if (typeof code === "string" && CODE.test(code)) result[key] = code;
  }
  return result;
}

/** 转成 Next metadata 的 verification 字段（Google/Yandex 有内置名，其余走 other）。 */
export function verificationMetadata(
  verification: SearchVerification,
): Metadata["verification"] | undefined {
  const other: Record<string, string> = {};
  for (const { key, meta } of SEARCH_ENGINES) {
    const code = verification[key];
    if (code && key !== "google" && key !== "yandex") other[meta] = code;
  }
  const result = {
    ...(verification.google ? { google: verification.google } : {}),
    ...(verification.yandex ? { yandex: verification.yandex } : {}),
    ...(Object.keys(other).length ? { other } : {}),
  };
  return Object.keys(result).length ? result : undefined;
}
