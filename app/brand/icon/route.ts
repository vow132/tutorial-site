import { readFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { BRAND_ICON_SIZES, brandIconVersion } from "@/lib/brand-icon";
import { getSettings } from "@/lib/settings";

/** 生成好的 PNG 按「图片 + 尺寸」缓存，图标被反复请求时不重复缩放。 */
const cache = new Map<string, Uint8Array>();

/**
 * 网站图标：把后台上传的图片（站点设置 → 品牌 → 网站图标）缩放成正方形 PNG。
 * /brand/icon?s=32|180|192|512&v=<版本>；没上传时 404（页面此时链接的是默认的 /favicon.ico）。
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const size = Number(url.searchParams.get("s"));
  if (!(BRAND_ICON_SIZES as readonly number[]).includes(size)) return new Response("Not Found", { status: 404 });
  const { brand } = await getSettings();
  const version = brandIconVersion(brand.favicon);
  if (!version) return new Response("Not Found", { status: 404 });

  const key = `${brand.favicon}:${size}`;
  let png = cache.get(key);
  if (!png) {
    try {
      const source = await readFile(path.join(process.cwd(), "public", brand.favicon));
      png = new Uint8Array(
        await sharp(source).resize(size, size, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer(),
      );
    } catch {
      return new Response("Not Found", { status: 404 });
    }
    cache.set(key, png);
    if (cache.size > 16) cache.delete(cache.keys().next().value!);
  }
  const current = url.searchParams.get("v") === version;
  return new Response(png as BodyInit, {
    headers: {
      "Content-Type": "image/png",
      "Cache-Control": current ? "public, max-age=31536000, immutable" : "public, max-age=300",
    },
  });
}
