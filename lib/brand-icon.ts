import { UPLOAD_IMAGE_PATH } from "@/lib/settings-extras";

/** 网站图标的版本号：上传的文件名本身是随机的，换一张图地址就变，浏览器不会用旧缓存。 */
export function brandIconVersion(favicon: string) {
  if (!favicon || !UPLOAD_IMAGE_PATH.test(favicon)) return "";
  return favicon.replace(/^\/uploads\//, "").replace(/\.[a-z]+$/i, "");
}

/** /brand/icon 支持的尺寸：浏览器标签 32、iOS 桌面 180、安卓 / PWA 192 和 512。 */
export const BRAND_ICON_SIZES = [32, 180, 192, 512] as const;
