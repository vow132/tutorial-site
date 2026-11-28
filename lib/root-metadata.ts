import type { Metadata, Viewport } from "next";
import { brandIconPath, siteIconVersion } from "@/lib/brand-icon";
import type { SiteSettings } from "@/lib/settings";

/** 前台、后台两个根布局共用的 viewport：让刘海屏、全面屏和横屏设备用真实视口宽度渲染 */
export const ROOT_VIEWPORT: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#f7f8fa",
};

/** 网站图标：后台上传的图标，或者按 Logo 文字和主题色生成的字母图标（lib/site-icon.ts），地址带版本号 */
export function siteIconsMetadata(settings: SiteSettings): Metadata["icons"] {
  const version = siteIconVersion(settings);
  const icon = (size: number) => brandIconPath(size, version);
  return {
    icon: [
      { url: icon(32), sizes: "32x32", type: "image/png" },
      { url: icon(192), sizes: "192x192", type: "image/png" },
    ],
    apple: [{ url: icon(180), sizes: "180x180", type: "image/png" }],
  };
}
