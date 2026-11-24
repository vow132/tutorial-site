import type { MetadataRoute } from "next";
import { accentVariables } from "@/lib/brand";
import { BRAND_ICON_SIZES, brandIconPath, siteIconVersion } from "@/lib/brand-icon";
import { DEFAULT_ACCENT } from "@/lib/settings-extras";
import { getSettings } from "@/lib/settings";

// 站名、图标、主题色都来自后台设置，每次请求现读（访问很少）
export const dynamic = "force-dynamic";

/** 网站清单：手机「添加到主屏幕」时用的名字、图标和颜色。 */
export default async function manifest(): Promise<MetadataRoute.Manifest> {
  const settings = await getSettings();
  const version = siteIconVersion(settings);
  return {
    name: settings.siteName,
    short_name: Array.from(settings.siteName).slice(0, 12).join(""),
    description: settings.siteDescription,
    lang: "zh-CN",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#f7f8fa",
    theme_color: settings.brand.accentColor ? accentVariables(settings.brand.accentColor).light.brand : DEFAULT_ACCENT,
    icons: BRAND_ICON_SIZES.filter((size) => size >= 192).map((size) => ({
      src: brandIconPath(size, version),
      sizes: `${size}x${size}`,
      type: "image/png",
      purpose: "any",
    })),
  };
}
