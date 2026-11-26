import { mkdir, readdir, rename, stat } from "node:fs/promises";
import path from "node:path";
import { isVariantName, RECENT_UPLOAD_DAYS, trashDir, uploadStem } from "@/lib/upload-refs.mjs";

/*
 * 图片库里只碰文件系统的部分（不查库，单元测试用临时目录测）：列出上传目录、挑出可清理的、移到回收目录。
 */

export const UPLOADS_DIR = path.join(process.cwd(), "public", "uploads");
export const RECENT_MS = RECENT_UPLOAD_DAYS * 24 * 60 * 60 * 1000;

export type UploadEntry = { name: string; bytes: number; modifiedAt: Date; variants: string[] };

/** 上传目录里的图片，按原图归并（小图的体积算在原图上），新的在前。跳过 .trash 等隐藏文件。 */
export async function listUploads(dir = UPLOADS_DIR): Promise<UploadEntry[]> {
  const names = (await readdir(dir).catch(() => [] as string[])).filter((name) => !name.startsWith("."));
  const files = (
    await Promise.all(
      names.map(async (name) => {
        const info = await stat(path.join(dir, name)).catch(() => null);
        return info?.isFile() ? { name, bytes: info.size, modifiedAt: info.mtime } : null;
      }),
    )
  ).filter((file): file is { name: string; bytes: number; modifiedAt: Date } => file !== null);
  const byStem = new Map<string, UploadEntry>();
  // 原图先登记，小图再并进去；只有小图没有原图的（原图被手动删了）单独列出
  for (const file of [...files].sort((a, b) => Number(isVariantName(a.name)) - Number(isVariantName(b.name)))) {
    const stem = uploadStem(file.name);
    const entry = byStem.get(stem);
    if (entry) {
      entry.bytes += file.bytes;
      entry.variants.push(file.name);
    } else {
      byStem.set(stem, { name: file.name, bytes: file.bytes, modifiedAt: file.modifiedAt, variants: [] });
    }
  }
  return [...byStem.values()].sort((a, b) => b.modifiedAt.getTime() - a.modifiedAt.getTime());
}

/** 列表里用的小图：有 -400w 就用它，否则原图。 */
export function previewName(entry: Pick<UploadEntry, "name" | "variants">) {
  return entry.variants.find((name) => /-400w\.webp$/i.test(name)) ?? entry.name;
}

/** 可以批量清理的：没被引用（stem 不在 referenced 里）、而且不是最近几天上传的。 */
export function pickCleanable(entries: Pick<UploadEntry, "name" | "modifiedAt">[], referenced: ReadonlySet<string>, now = Date.now()) {
  return entries
    .filter((entry) => !referenced.has(uploadStem(entry.name)) && now - entry.modifiedAt.getTime() >= RECENT_MS)
    .map((entry) => uploadStem(entry.name));
}

/** 把这些原图（连同小图）移到回收目录（上传目录里的 .trash/<时间>/），返回移动的文件数和体积。 */
export async function moveUploadsToTrash(stems: Iterable<string>, dir = UPLOADS_DIR) {
  const wanted = new Set(stems);
  const entries = (await listUploads(dir)).filter((entry) => wanted.has(uploadStem(entry.name)));
  if (entries.length === 0) return { files: 0, bytes: 0 };
  const trash = trashDir(dir);
  await mkdir(trash, { recursive: true });
  let files = 0;
  let bytes = 0;
  for (const entry of entries) {
    for (const name of [entry.name, ...entry.variants]) {
      await rename(path.join(dir, name), path.join(trash, name));
      files += 1;
    }
    bytes += entry.bytes;
  }
  return { files, bytes };
}

export const formatBytes = (bytes: number) =>
  bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
