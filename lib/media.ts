import { prisma } from "@/lib/prisma";
import { listUploads, pickCleanable, previewName, RECENT_MS } from "@/lib/media-files";
import { uploadNamesIn, uploadStem } from "@/lib/upload-refs.mjs";

export { formatBytes, moveUploadsToTrash, UPLOADS_DIR } from "@/lib/media-files";

/*
 * 后台「图片库」（/admin/media）的数据：上传目录里的图片、每张被哪里引用、移到回收目录。
 * 「引用」的判断和 npm run uploads:clean 共用 lib/upload-refs.mjs。
 */

export const MEDIA_PAGE_SIZE = 48;

export type MediaReference = { kind: "tutorial" | "revision" | "setting"; label: string; href: string | null };

export type MediaFile = {
  /** 原图文件名（响应式小图并在原图里） */
  name: string;
  url: string;
  /** 列表里显示的小图（有 400w 就用它） */
  preview: string;
  /** 原图加上所有小图的体积 */
  bytes: number;
  modifiedAt: Date;
  /** 最近几天内上传的：可能在还没保存的草稿里，批量清理时跳过 */
  recent: boolean;
  references: MediaReference[];
};

const SETTING_LABELS: Record<string, { label: string; href: string }> = {
  site: { label: "站点设置", href: "/admin/settings" },
  about: { label: "关于页面", href: "/admin/about" },
};

/** 原图标识（stem）→ 引用它的地方。扫一遍教程（正文、封面、缩略图）、历史版本和设置。 */
export async function collectReferences(): Promise<Map<string, MediaReference[]>> {
  const map = new Map<string, MediaReference[]>();
  const add = (texts: (string | null)[], reference: MediaReference) => {
    const stems = new Set(texts.flatMap((text) => uploadNamesIn(text)).map(uploadStem));
    for (const stem of stems) {
      const list = map.get(stem) ?? [];
      if (!list.some((item) => item.kind === reference.kind && item.label === reference.label)) list.push(reference);
      map.set(stem, list);
    }
  };
  const [tutorials, revisions, settings] = await Promise.all([
    prisma.tutorial.findMany({ select: { id: true, title: true, content: true, cover: true, thumbnail: true } }),
    prisma.tutorialRevision.findMany({ select: { content: true, tutorial: { select: { id: true, title: true } } } }),
    prisma.setting.findMany({ select: { key: true, value: true } }),
  ]);
  for (const t of tutorials) add([t.content, t.cover, t.thumbnail], { kind: "tutorial", label: t.title, href: `/admin/tutorials/${t.id}` });
  for (const r of revisions) {
    add([r.content], { kind: "revision", label: `${r.tutorial.title}（历史版本）`, href: `/admin/tutorials/${r.tutorial.id}/revisions` });
  }
  for (const s of settings) {
    const known = SETTING_LABELS[s.key];
    add([s.value], { kind: "setting", label: known?.label ?? `设置：${s.key}`, href: known?.href ?? null });
  }
  return map;
}

export type MediaLibrary = {
  items: MediaFile[];
  page: number;
  pages: number;
  total: number;
  stats: { count: number; bytes: number; unusedCount: number; unusedBytes: number; cleanableCount: number; cleanableBytes: number };
};

export async function getMediaLibrary({ query = "", unusedOnly = false, page = 1 } = {}): Promise<MediaLibrary> {
  const [uploads, references] = await Promise.all([listUploads(), collectReferences()]);
  const now = Date.now();
  const all: MediaFile[] = uploads.map((entry) => ({
    name: entry.name,
    url: `/uploads/${entry.name}`,
    preview: `/uploads/${previewName(entry)}`,
    bytes: entry.bytes,
    modifiedAt: entry.modifiedAt,
    recent: now - entry.modifiedAt.getTime() < RECENT_MS,
    references: references.get(uploadStem(entry.name)) ?? [],
  }));
  const unused = all.filter((item) => item.references.length === 0);
  const cleanable = unused.filter((item) => !item.recent);
  const needle = query.trim().toLowerCase();
  const filtered = (unusedOnly ? unused : all).filter((item) => !needle || item.name.toLowerCase().includes(needle));
  const pages = Math.max(1, Math.ceil(filtered.length / MEDIA_PAGE_SIZE));
  const current = Math.min(Math.max(1, Math.floor(page) || 1), pages);
  const sum = (list: MediaFile[]) => list.reduce((total, item) => total + item.bytes, 0);
  return {
    items: filtered.slice((current - 1) * MEDIA_PAGE_SIZE, current * MEDIA_PAGE_SIZE),
    page: current,
    pages,
    total: filtered.length,
    stats: {
      count: all.length,
      bytes: sum(all),
      unusedCount: unused.length,
      unusedBytes: sum(unused),
      cleanableCount: cleanable.length,
      cleanableBytes: sum(cleanable),
    },
  };
}

/** 可以批量清理的：没被引用、而且不是最近几天上传的（原图标识列表）。 */
export async function cleanableStems(): Promise<string[]> {
  const [uploads, references] = await Promise.all([listUploads(), collectReferences()]);
  return pickCleanable(uploads, new Set(references.keys()));
}
