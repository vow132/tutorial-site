"use server";

import { Prisma } from "@/generated/prisma/client";
import { requireAuth } from "@/lib/admin-auth";
import { DEMO_READ_ONLY_MESSAGE, isDemoMode } from "@/lib/demo";
import { firstUploadedImage, thumbnailFor } from "@/lib/article";
import { audit } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { fetchRemoteImage, RemoteImageError } from "@/lib/remote-image";
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
  if (isDemoMode()) return { ok: false, error: DEMO_READ_ONLY_MESSAGE };
  await requireAuth();
  if (!input || typeof input !== "object") return { ok: false, error: "数据无效" };
  const title = String(input.title ?? "").trim().slice(0, 200);
  if (!title) return { ok: false, error: "缺少标题" };
  const content = sanitizeArticleHtml(String(input.content ?? "")).trim();
  if (!content || content === "<p></p>") return { ok: false, error: "正文是空的" };
  const categoryId = Number(input.categoryId);
  if (!Number.isInteger(categoryId) || !(await prisma.category.findUnique({ where: { id: categoryId }, select: { id: true } }))) {
    return { ok: false, error: "所选分类不存在，请刷新页面重新选择" };
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
      return { ok: false, error: "保存失败，请查看服务器日志" };
    }
  }
  return { ok: false, error: "网址别名冲突，请稍后重试" };
}

/** 把外链图片下载到本站（防 SSRF，见 lib/remote-image.ts），返回本站地址。 */
export async function importRemoteImage(url: string): Promise<{ url: string } | { error: string }> {
  if (isDemoMode()) return { error: DEMO_READ_ONLY_MESSAGE };
  await requireAuth();
  if (typeof url !== "string" || url.length > 2048) return { error: "图片地址无效" };
  try {
    const stored = await storeUploadedImage(await fetchRemoteImage(url));
    return "error" in stored ? { error: stored.error } : { url: stored.url };
  } catch (error) {
    return { error: error instanceof RemoteImageError ? error.message : "下载失败" };
  }
}

/** 一批导入结束：刷新前台缓存、更新搜索索引，记一条安全日志。 */
export async function finishImport(summary: { created: number; failed: number; images: number; source: string; slugs: string[] }) {
  const admin = await requireAuth();
  const count = (value: unknown) => (Number.isInteger(value) && (value as number) >= 0 ? (value as number) : 0);
  const source = typeof summary?.source === "string" ? summary.source.slice(0, 40) : "";
  await audit("tutorial.import", {
    actor: admin.username,
    detail: `${source}：导入 ${count(summary?.created)} 篇，失败 ${count(summary?.failed)} 篇，图片 ${count(summary?.images)} 张`,
  });
  const slugs = Array.isArray(summary?.slugs) ? summary.slugs.filter((slug): slug is string => typeof slug === "string").slice(0, 1000) : [];
  revalidatePublic(...slugs);
}
