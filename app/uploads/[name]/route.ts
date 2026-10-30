import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";

export const runtime = "nodejs";

const UPLOADS_DIR = path.join(process.cwd(), "public", "uploads");

const CONTENT_TYPES: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  // 历史上传的 SVG 仍可显示；直接打开时由 sandbox CSP 禁止脚本执行。
  ".svg": "image/svg+xml",
};

/**
 * `next start` 只在进程启动时扫描一次 public 目录，之后上传的图片会 404，
 * 直到下次重启。启动时已存在的文件仍由 Next 直接提供，这里只兜底新文件。
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ name: string }> },
) {
  const { name } = await params;
  const type = CONTENT_TYPES[path.extname(name).toLowerCase()];
  // 只接受 uploads 目录下的普通文件名，拒绝 ../、编码字符和隐藏文件。
  if (!type || !/^[\w-][\w.-]*$/.test(name)) {
    return new Response("Not Found", { status: 404 });
  }

  const file = path.join(UPLOADS_DIR, name);
  const info = await stat(file).catch(() => null);
  if (!info?.isFile()) return new Response("Not Found", { status: 404 });

  return new Response(Readable.toWeb(createReadStream(file)) as ReadableStream, {
    headers: {
      "Content-Type": type,
      "Content-Length": String(info.size),
      // 文件名含时间戳和随机串、永不覆盖，可长期缓存。
      "Cache-Control": "public, max-age=31536000, immutable",
      "Content-Security-Policy": "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; sandbox",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
