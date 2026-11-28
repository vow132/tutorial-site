import { randomBytes } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { variantName } from "@/lib/image-variants";
import { createVariants, detectImageFormat, optimizeImage } from "@/lib/upload-image";

/**
 * 把一张图片存进 public/uploads：按文件头识别格式（不接受 SVG）、缩放转 WebP、去 EXIF，并生成响应式小图。
 * 后台上传（app/api/upload）和批量导入下载外链图片共用。
 */
/** 失败原因（文字按后台语言：m.admin.upload） */
export type UploadProblem = "unsupported" | "broken";

export async function storeUploadedImage(buffer: Buffer): Promise<{ url: string; name: string; bytes: number } | { error: UploadProblem }> {
  const ext = detectImageFormat(buffer);
  if (!ext) return { error: "unsupported" };

  let optimized: { data: Buffer; ext: string };
  try {
    optimized = await optimizeImage(buffer, ext);
  } catch {
    return { error: "broken" };
  }

  const dir = path.join(process.cwd(), "public", "uploads");
  await mkdir(dir, { recursive: true });
  const name = `${Date.now()}-${randomBytes(6).toString("hex")}${optimized.ext}`;
  await writeFile(path.join(dir, name), optimized.data);
  // 响应式小图失败不影响上传本身，正文会退回只用原图。
  try {
    for (const [width, data] of await createVariants(optimized.data)) {
      await writeFile(path.join(dir, variantName(name, width)), data);
    }
  } catch (error) {
    console.warn("[upload] 生成响应式小图失败：", error);
  }
  return { url: `/uploads/${name}`, name, bytes: optimized.data.length };
}
