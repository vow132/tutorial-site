"use server";

import { Prisma } from "@/generated/prisma/client";
import { requireAuth } from "@/lib/admin-auth";
import { isDemoMode } from "@/lib/demo";
import { getAdminI18n } from "@/lib/i18n/server";
import { firstUploadedImage, thumbnailFor } from "@/lib/article";
import { audit } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { fetchRemoteImage, RemoteImageError, remoteImageMessage } from "@/lib/remote-image";
import { revalidatePublic } from "@/lib/revalidate-public";
import { sanitizeArticleHtml } from "@/lib/sanitize";
import { setTutorialTags } from "@/lib/tag-sync";
import { cleanImportTags, importDates, slugCandidates } from "@/lib/tutorial-import";
import { normalizeSlug } from "@/lib/tutorial-slug";
import { storeUploadedImage } from "@/lib/upload-store";

/**
 * 后台「批量导入」（app/admin/(panel)/tutorials/import）：浏览器解析文件后逐篇调用 importTutorial，
 * 图片先上传（本地图片走 /api/upload，外链图片走 importRemoteImage），全部做完调用 finishImport 刷新前台并记安全日志。
 * 这些函数可以被直接调用，入参一律按不可信处理。
 */

export type ImportTutorialInput = {
  title: string;
  slug: string;
  excerpt: string;
  content: string;
  tags: string[];
  categoryId: number;
  published: boolean;
  createdAt: string | null;
  updatedAt: string | null;
};

export type ImportTutorialResult = { ok: true; id: number; slug: string } | { ok: false; error: string };

async function availableSlug(base: string) {
  for (const candidate of slugCandidates(base)) {
    if (!(await prisma.tutorial.findUnique({ where: { slug: candidate }, select: { id: true } }))) return candidate;
  }
  return `${base.slice(0, 70)}-${Date.now().toString(36)}`;
}

export async function importTutorial(input: ImportTutorialInput): Promise<ImportTutorialResult> {
  const { m } = await getAdminI18n();
  const t = m.admin.tutorials;
  if (isDemoMode()) return { ok: false, error: m.admin.demoReadOnly };
  const admin = await requireAuth("import");
  if (!input || typeof input !== "object") return { ok: false, error: t.importInvalid };
  const title = String(input.title ?? "").trim().slice(0, 200);
  if (!title) return { ok: false, error: t.importNoTitle };
  const content = sanitizeArticleHtml(String(input.content ?? "")).trim();
  if (!content || content === "<p></p>") return { ok: false, error: t.importEmpty };
  const categoryId = Number(input.categoryId);
  if (!Number.isInteger(categoryId) || !(await prisma.category.findUnique({ where: { id: categoryId }, select: { id: true } }))) {
    return { ok: false, error: t.importCategoryMissing };
  }
  const excerpt = Array.from(String(input.excerpt ?? "").trim()).slice(0, 500).join("") || null;
  const { createdAt, updatedAt } = importDates(input.createdAt, input.updatedAt);
  const thumbnail = await thumbnailFor(firstUploadedImage(content));
  const data = {
    title,
    excerpt,
    content,
    categoryId,
    published: input.published === true,
    thumbnail,
    createdAt,
    updatedAt,
    // 迁移过来的是旧文章：不给订阅者发「新教程」邮件，以后从草稿改成发布也不发
    notifiedAt: new Date(),
    authorId: admin.id,
  };

  const base = normalizeSlug(String(input.slug ?? "").trim(), title);
  for (let attempt = 0; attempt < 3; attempt++) {
    const slug = await availableSlug(base);
    try {
      const created = await prisma.tutorial.create({ data: { ...data, slug }, select: { id: true, slug: true } });
      await setTutorialTags(created.id, cleanImportTags(input.tags));
      return { ok: true, id: created.id, slug: created.slug };
    } catch (error) {
      // 同时导入的另一篇抢先用了这个 slug：重新找一个
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") continue;
      console.error("[import] 导入失败：", error);
      return { ok: false, error: t.importSaveFailed };
    }
  }
  return { ok: false, error: t.importSlugConflict };
}

/** 把外链图片下载到本站（防 SSRF，见 lib/remote-image.ts），返回本站地址。 */
export async function importRemoteImage(url: string): Promise<{ url: string } | { error: string }> {
  const { m } = await getAdminI18n();
  if (isDemoMode()) return { error: m.admin.demoReadOnly };
  await requireAuth("import");
  if (typeof url !== "string" || url.length > 2048) return { error: m.admin.tutorials.imageUrlInvalid };
  try {
    const stored = await storeUploadedImage(await fetchRemoteImage(url));
    return "error" in stored ? { error: m.admin.upload[stored.error] } : { url: stored.url };
  } catch (error) {
    return { error: error instanceof RemoteImageError ? remoteImageMessage(error, m) : m.admin.tutorials.downloadFailed };
  }
}

/** 一批导入结束：刷新前台缓存、更新搜索索引，记一条安全日志。 */
export async function finishImport(summary: { created: number; failed: number; images: number; source: string; slugs: string[] }) {
  const admin = await requireAuth("import");
  const { m, f } = await getAdminI18n();
  const count = (value: unknown) => (Number.isInteger(value) && (value as number) >= 0 ? (value as number) : 0);
  const source = typeof summary?.source === "string" ? summary.source.slice(0, 40) : "";
  await audit("tutorial.import", {
    actor: admin.username,
    detail: f(m.admin.auditDetail.imported, { source, created: count(summary?.created), failed: count(summary?.failed), images: count(summary?.images) }),
  });
  const slugs = Array.isArray(summary?.slugs) ? summary.slugs.filter((slug): slug is string => typeof slug === "string").slice(0, 1000) : [];
  revalidatePublic(...slugs);
}
