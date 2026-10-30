import { NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { getCurrentAdmin } from "@/lib/admin-auth";
import { audit } from "@/lib/audit";
import { detectImageFormat, optimizeImage } from "@/lib/upload-image";

const MAX_SIZE = 5 * 1024 * 1024; // 5MB

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
  const ext = detectImageFormat(buffer);
  if (!ext) {
    return NextResponse.json(
      { error: "仅支持 PNG/JPG/GIF/WebP 图片（出于安全考虑不再接受 SVG）" },
      { status: 400 }
    );
  }

  let optimized: { data: Buffer; ext: string };
  try {
    optimized = await optimizeImage(buffer, ext);
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
