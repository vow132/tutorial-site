import { NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { getCurrentAdmin } from "@/lib/admin-auth";
import { audit } from "@/lib/audit";

const MAX_SIZE = 5 * 1024 * 1024; // 5MB

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

  const dir = path.join(process.cwd(), "public", "uploads");
  await mkdir(dir, { recursive: true });
  const name = `${Date.now()}-${randomBytes(6).toString("hex")}${format.ext}`;
  await writeFile(path.join(dir, name), buffer);
  await audit("upload", { actor: admin.username, detail: `${name}（${file.size} 字节）` });

  return NextResponse.json({ url: `/uploads/${name}` });
}
