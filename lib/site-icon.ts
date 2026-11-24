import { readFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { accentVariables } from "@/lib/brand";
import { brandIconVersion, letterIconVersion } from "@/lib/brand-icon";
import { DEFAULT_ACCENT } from "@/lib/settings-extras";
import { getSettings } from "@/lib/settings";
import { renderLetterIcon } from "@/lib/share-image-render";

/** 缩放好的上传图标按「图片 + 尺寸」缓存，图标被反复请求时不重复处理。 */
const resized = new Map<string, Uint8Array>();

/**
 * 网站图标 PNG（/brand/icon、/favicon.ico、网站清单共用）：
 * 后台上传了网站图标就缩放成正方形；没上传或文件已经不在了，就画一个「主题色方块 + Logo 文字」的字母图标，
 * 和页面左上角的 Logo 一致。返回图片和它的版本号（图标或 Logo 文字、主题色变了版本就变）。
 */
export async function siteIconPng(size: number): Promise<{ png: Uint8Array; version: string }> {
  const { brand, logoText, siteName } = await getSettings();
  const uploaded = brandIconVersion(brand.favicon);
  if (uploaded) {
    const key = `${brand.favicon}:${size}`;
    let png = resized.get(key);
    if (!png) {
      try {
        const source = await readFile(path.join(process.cwd(), "public", brand.favicon));
        png = new Uint8Array(
          await sharp(source).resize(size, size, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer(),
        );
        resized.set(key, png);
        if (resized.size > 16) resized.delete(resized.keys().next().value!);
      } catch {
        png = undefined;
      }
    }
    if (png) return { png, version: uploaded };
  }
  const background = brand.accentColor ? accentVariables(brand.accentColor).light.brand : DEFAULT_ACCENT;
  return {
    png: await renderLetterIcon(logoText || siteName, background, size),
    version: letterIconVersion(logoText, brand.accentColor),
  };
}
