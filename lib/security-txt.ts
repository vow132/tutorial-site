/**
 * /.well-known/security.txt（RFC 9116）：告诉安全研究人员发现漏洞后该联系谁。
 * 联系方式在后台「站点设置」填写，留空则不提供该文件（返回 404）。
 */

/** 把后台填写的联系方式规范成 Contact 字段的值；空串表示不提供，格式不对返回 null。 */
export function normalizeSecurityContact(input: string): string | null {
  const value = input.trim();
  if (!value) return "";
  if (/^mailto:[^\s@]+@[^\s@]+\.[^\s@]+$/i.test(value)) return value;
  if (/^[^\s@:/]+@[^\s@]+\.[^\s@]+$/.test(value)) return `mailto:${value}`;
  if (/^https:\/\/[^\s]+$/i.test(value)) {
    try {
      return new URL(value).href;
    } catch {
      return null;
    }
  }
  return null;
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** 生成文件内容。Expires 取半年后（按天取整），RFC 建议不超过一年。 */
export function buildSecurityTxt({
  contact,
  canonical,
  policy,
  now = Date.now(),
}: {
  contact: string;
  canonical: string;
  policy?: string;
  now?: number;
}) {
  const expires = new Date(Math.floor(now / DAY_MS) * DAY_MS + 180 * DAY_MS);
  return [
    `Contact: ${contact}`,
    `Expires: ${expires.toISOString()}`,
    "Preferred-Languages: zh, en",
    `Canonical: ${canonical}`,
    ...(policy ? [`Policy: ${policy}`] : []),
    "",
  ].join("\n");
}
