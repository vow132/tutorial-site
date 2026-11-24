import { BRAND_ICON_SIZES } from "@/lib/brand-icon";
import { siteIconPng } from "@/lib/site-icon";

/**
 * 网站图标：/brand/icon?s=32|180|192|512&v=<版本>。后台上传了网站图标就用它，否则按 Logo 文字和主题色生成（lib/site-icon.ts）。
 * 地址里的版本和当前一致时长期缓存；旧版本只短期缓存。
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const size = Number(url.searchParams.get("s"));
  if (!(BRAND_ICON_SIZES as readonly number[]).includes(size)) return new Response("Not Found", { status: 404 });
  try {
    const { png, version } = await siteIconPng(size);
    return new Response(png as BodyInit, {
      headers: {
        "Content-Type": "image/png",
        "Cache-Control": url.searchParams.get("v") === version ? "public, max-age=31536000, immutable" : "public, max-age=300",
      },
    });
  } catch (error) {
    console.error("[brand-icon] 生成网站图标失败：", error);
    return new Response("Internal Server Error", { status: 500 });
  }
}
