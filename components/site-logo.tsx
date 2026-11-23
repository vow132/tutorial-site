import type { SiteSettings } from "@/lib/settings";

/**
 * 站点 Logo：后台上传了 Logo 图片就用图片，否则用「Logo 字符」配主题色方块（白字对比度 ≥ 4.5）。
 * 旁边总会显示站名，所以图片本身是装饰（alt 留空）。
 */
export default function SiteLogo({ settings, className }: { settings: Pick<SiteSettings, "logoText" | "brand">; className: string }) {
  if (settings.brand.logoImage) {
    // eslint-disable-next-line @next/next/no-img-element -- 后台上传的静态图片
    return <img src={settings.brand.logoImage} alt="" className={`${className} rounded-lg object-cover`} />;
  }
  return (
    <span className={`${className} flex items-center justify-center rounded-lg bg-brand font-bold text-white`}>
      {settings.logoText}
    </span>
  );
}
