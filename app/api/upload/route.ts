import { NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { getCurrentAdmin } from "@/lib/admin-auth";
import { audit } from "@/lib/audit";

const MAX_SIZE = 5 * 1024 * 1024; // 5MB
/** 正文栏宽约 760px，1600px 足够 2 倍屏清晰显示。 */
const MAX_WIDTH = 1600;
/** 解码像素上限，防止小文件解压成巨图（解压炸弹）耗尽内存。 */
const MAX_INPUT_PIXELS = 40_000_000;

/**
 * 按文件头（magic bytes）识别格式，不信任浏览器给的 MIME 和扩展名。
 * SVG 能内嵌脚本，正则过滤可被绕过，因此不再接受上传。
 */
const FORMATS: Array<{ ext: string; matches: (head: Buffer) => boolean }> = [
  {
    ext: ".png",
    matches: (head) =>
      head.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
  },
  { ext: ".jpg", matches: (head) => head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff },
  {
    ext: ".gif",
    matches: (head) => ["GIF87a", "GIF89a"].includes(head.subarray(0, 6).toString("latin1")),
  },
  {
    ext: ".webp",
    matches: (head) =>
      head.subarray(0, 4).toString("latin1") === "RIFF" &&
      head.subarray(8, 12).toString("latin1") === "WEBP",
  },
];

/**
 * 缩放并转成 WebP：手机原图常有几 MB，转换后通常只剩几十到几百 KB。
 * rotate() 按 EXIF 方向摆正，输出不带 EXIF（包括 GPS 定位等隐私信息）。
 * GIF 可能是动图，保持原样，只检查尺寸。
 */
async function optimizeImage(buffer: Buffer, ext: string): Promise<{ data: Buffer; ext: string }> {
  if (ext === ".gif") {
    const meta = await sharp(buffer, { animated: true }).metadata();
    const frameHeight = meta.pageHeight ?? meta.height ?? 0;
    if ((meta.width ?? 0) * frameHeight > MAX_INPUT_PIXELS) throw new Error("too large");
    return { data: buffer, ext };
  }

  const data = await sharp(buffer, { limitInputPixels: MAX_INPUT_PIXELS, failOn: "error" })
    .rotate()
    .resize({ width: MAX_WIDTH, withoutEnlargement: true })
    // 截图（PNG）以文字为主，用更高质量避免字边发糊；照片 82 已足够。
    .webp(ext === ".png" ? { quality: 90, smartSubsample: true } : { quality: 82 })
    .toBuffer();
  // 本来就很小的 PNG/WebP 重新编码可能更大，保留原文件；JPEG 始终重编码以去掉 EXIF。
  if (ext !== ".jpg" && data.length >= buffer.length) return { data: buffer, ext };
  return { data, ext: ".webp" };
}

export async function POST(request: Request) {
  const admin = await getCurrentAdmin();
  if (!admin) {
    return NextResponse.json({ error: "未登录或会话已过期" }, { status: 401 });
  }

  // 先看声明的长度，避免把超大请求体整个读进内存。
  const declared = Number(request.headers.get("content-length") ?? 0);
  if (declared > MAX_SIZE + 64 * 1024) {
    return NextResponse.json({ error: "图片不能超过 5MB" }, { status: 413 });
  }

  const form = await request.formData();
  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "缺少文件" }, { status: 400 });
  }
  if (file.size > MAX_SIZE) {
    return NextResponse.json({ error: "图片不能超过 5MB" }, { status: 400 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const format = FORMATS.find((candidate) => candidate.matches(buffer));
  if (!format) {
    return NextResponse.json(
      { error: "仅支持 PNG/JPG/GIF/WebP 图片（出于安全考虑不再接受 SVG）" },
      { status: 400 }
    );
  }

  let optimized: { data: Buffer; ext: string };
  try {
    optimized = await optimizeImage(buffer, format.ext);
  } catch {
    return NextResponse.json(
      { error: "图片已损坏或尺寸过大（最多约 4000 万像素）" },
      { status: 400 }
    );
  }

  const dir = path.join(process.cwd(), "public", "uploads");
  await mkdir(dir, { recursive: true });
  const name = `${Date.now()}-${randomBytes(6).toString("hex")}${optimized.ext}`;
  await writeFile(path.join(dir, name), optimized.data);
  await audit("upload", {
    actor: admin.username,
    detail: `${name}（${file.size} → ${optimized.data.length} 字节）`,
  });

  return NextResponse.json({ url: `/uploads/${name}` });
}
