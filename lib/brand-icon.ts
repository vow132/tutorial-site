import { createHash } from "node:crypto";
import { DEFAULT_ACCENT, UPLOAD_IMAGE_PATH } from "@/lib/settings-extras";

/** 网站图标的版本号：上传的文件名本身是随机的，换一张图地址就变，浏览器不会用旧缓存。 */
export function brandIconVersion(favicon: string) {
  if (!favicon || !UPLOAD_IMAGE_PATH.test(favicon)) return "";
  return favicon.replace(/^\/uploads\//, "").replace(/\.[a-z]+$/i, "");
}

/** 字母图标的模板改版时加一，让旧地址失效。 */
const LETTER_ICON_TEMPLATE = "1";

/** 没上传网站图标时，按 Logo 文字和主题色生成的字母图标：两者改了地址就变。 */
export function letterIconVersion(logoText: string, accentColor: string) {
  const digest = createHash("sha256").update(JSON.stringify([LETTER_ICON_TEMPLATE, logoText, accentColor || DEFAULT_ACCENT])).digest("base64url");
  return `l-${digest.slice(0, 10)}`;
}

/** 当前网站图标的版本：上传了图标用图标文件，否则用字母图标。 */
export function siteIconVersion(settings: { logoText: string; brand: { favicon: string; accentColor: string } }) {
  return brandIconVersion(settings.brand.favicon) || letterIconVersion(settings.logoText, settings.brand.accentColor);
}

/** /brand/icon 支持的尺寸：浏览器标签 32、iOS 桌面 180、安卓 / 网站清单 192 和 512。 */
export const BRAND_ICON_SIZES = [32, 180, 192, 512] as const;

export const brandIconPath = (size: number, version: string) => `/brand/icon?s=${size}&v=${version}`;
