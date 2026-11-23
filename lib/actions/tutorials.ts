"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/admin-auth";
import { audit } from "@/lib/audit";
import { sanitizeArticleHtml } from "@/lib/sanitize";
import { firstUploadedImage, thumbnailFor, uploadedImage } from "@/lib/article";
import { revalidatePublic } from "@/lib/revalidate-public";
import { contentChanged, saveRevision } from "@/lib/revisions";
import { parseTagNames } from "@/lib/tags";
import { setTutorialTags } from "@/lib/tag-sync";
import { notifyNewTutorial } from "@/lib/subscription-notify";

export type TutorialFormState = { error?: string };


function normalizeSlug(input: string, title: string) {
  const raw = (input || title).toLowerCase().trim();
  const slug = raw
    .replace(/[^a-z0-9一-龥]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
  return slug || `tutorial-${Date.now().toString(36)}`;
}

/** 封面只接受本站上传的图片（/uploads/文件名），防止填入外链或任意路径。 */
const COVER_URL = /^\/uploads\/[\w-]+\.(?:webp|png|jpe?g|gif)$/i;

async function parseForm(formData: FormData) {
  const title = String(formData.get("title") ?? "").trim();
  const excerpt = String(formData.get("excerpt") ?? "").trim();
  // 不信任客户端：Server Action 可被绕过编辑器直接调用，入库前按白名单过滤。
  const content = sanitizeArticleHtml(String(formData.get("content") ?? "")).trim();
  const categoryId = Number(formData.get("categoryId"));
  const seriesId = Number(formData.get("seriesId")) || null;
  let published = formData.get("published") === "on";
  // 定时发布：浏览器把本地时间换算成 ISO 字符串放在 publishAt 里
  const publishAtRaw = String(formData.get("publishAt") ?? "").trim();
  const publishAt = publishAtRaw ? new Date(publishAtRaw) : null;
  const cover = String(formData.get("cover") ?? "").trim() || null;
  // 标签输入框里还没确认成标签的文字（tagsPending）也一起算上，免得点保存时丢掉。
  const tags = parseTagNames(`${formData.get("tags") ?? ""},${formData.get("tagsPending") ?? ""}`);
  const slug = normalizeSlug(
    String(formData.get("slug") ?? "").trim(),
    title
  );

  if (!title) return { error: "请输入标题" as const };
  if (title.length > 200) return { error: "标题不能超过 200 个字符" as const };
  if (excerpt.length > 500) return { error: "摘要不能超过 500 个字符" as const };
  if (!content || content === "<p></p>") return { error: "正文不能为空" as const };
  if (!categoryId) return { error: "请选择分类" as const };
  if ("error" in tags) return { error: tags.error };
  if (publishAt) {
    if (Number.isNaN(publishAt.getTime())) return { error: "定时发布时间无效" as const };
    if (publishAt.getTime() <= Date.now()) return { error: "定时发布时间要晚于现在" as const };
    if (publishAt.getTime() > Date.now() + 366 * 24 * 60 * 60 * 1000) return { error: "定时发布最多提前一年" as const };
    published = false; // 到点前保持草稿
  }
  if (seriesId && !(await prisma.series.findUnique({ where: { id: seriesId }, select: { id: true } }))) {
    return { error: "所选系列不存在或已被删除，请重新选择" as const };
  }
  if (cover && (!COVER_URL.test(cover) || !(await uploadedImage(cover)))) {
    return { error: "封面图无效或文件已不存在，请重新上传" as const };
  }

  // 列表卡片缩略图：封面优先，否则取正文第一张本站上传的图片。
  const thumbnail = await thumbnailFor(cover ?? firstUploadedImage(content));

  return {
    data: { title, slug, excerpt: excerpt || null, content, categoryId, seriesId, published, publishAt, cover, thumbnail },
    tagNames: tags.names,
  };
}


/** 加入（或换到）某个系列时排在末尾；系列没变保持原位；不在系列里时为 0。 */
async function seriesOrderFor(seriesId: number | null, current?: { seriesId: number | null; seriesOrder: number } | null) {
  if (!seriesId) return 0;
  if (current?.seriesId === seriesId) return current.seriesOrder;
  const last = await prisma.tutorial.aggregate({ where: { seriesId }, _max: { seriesOrder: true } });
  return (last._max.seriesOrder ?? 0) + 1;
}

export async function createTutorial(
  _prev: TutorialFormState,
  formData: FormData
): Promise<TutorialFormState> {
  const admin = await requireAuth();
  const parsed = await parseForm(formData);
  if ("error" in parsed) return { error: parsed.error };

  const exists = await prisma.tutorial.findUnique({
    where: { slug: parsed.data.slug },
  });
  if (exists) return { error: "Slug 已被占用，请更换" };

  const created = await prisma.tutorial.create({
    data: { ...parsed.data, seriesOrder: await seriesOrderFor(parsed.data.seriesId) },
  });
  await setTutorialTags(created.id, parsed.tagNames);
  await audit("tutorial.create", { actor: admin.username, detail: `#${created.id} ${created.title}` });
  revalidatePublic(created.slug);
  // 邮件订阅：直接发布的新教程通知订阅者（后台发送，每篇只发一次）
  if (created.published) notifyNewTutorial(created.id);
  // ?saved= 让列表页清掉这篇的本地草稿（见 app/admin/(panel)/tutorials/clear-draft.tsx）
  redirect("/admin/tutorials?saved=new");
}

export async function updateTutorial(
  id: number,
  _prev: TutorialFormState,
  formData: FormData
): Promise<TutorialFormState> {
  const admin = await requireAuth();
  const parsed = await parseForm(formData);
  if ("error" in parsed) return { error: parsed.error };

  const conflict = await prisma.tutorial.findFirst({
    where: { slug: parsed.data.slug, NOT: { id } },
  });
  if (conflict) return { error: "Slug 已被其他教程占用" };

  const before = await prisma.tutorial.findUnique({
    where: { id },
    select: { slug: true, title: true, excerpt: true, content: true, updatedAt: true, seriesId: true, seriesOrder: true, published: true },
  });
  // 内容有改动时先把旧版本存进历史，误改后可以在「历史版本」里恢复
  if (before && contentChanged(before, parsed.data)) await saveRevision(id, before, admin.username);
  await prisma.tutorial.update({
    where: { id },
    data: { ...parsed.data, seriesOrder: await seriesOrderFor(parsed.data.seriesId, before) },
  });
  await setTutorialTags(id, parsed.tagNames);
  await audit("tutorial.update", { actor: admin.username, detail: `#${id} ${parsed.data.title}` });
  revalidatePublic(before?.slug, parsed.data.slug);
  if (before && !before.published && parsed.data.published) notifyNewTutorial(id);
  redirect(`/admin/tutorials?saved=${id}`);
}

export async function deleteTutorial(formData: FormData) {
  const admin = await requireAuth();
  const id = Number(formData.get("id"));
  if (!id) return;
  const deleted = await prisma.tutorial.delete({ where: { id } });
  await audit("tutorial.delete", { actor: admin.username, detail: `#${id} ${deleted.title}` });
  revalidatePublic(deleted.slug);
  revalidatePath("/admin/tutorials");
}

export async function togglePublish(formData: FormData) {
  const admin = await requireAuth();
  const id = Number(formData.get("id"));
  if (!id) return;
  const t = await prisma.tutorial.findUnique({ where: { id } });
  if (!t) return;
  await prisma.tutorial.update({
    where: { id },
    // 手动切换状态时取消定时发布
    data: { published: !t.published, publishAt: null },
  });
  await audit(t.published ? "tutorial.unpublish" : "tutorial.publish", {
    actor: admin.username,
    detail: `#${id} ${t.title}`,
  });
  revalidatePublic(t.slug);
  revalidatePath("/admin/tutorials");
  if (!t.published) notifyNewTutorial(id);
}

/** 恢复到某个历史版本：当前内容先存成一个新的历史版本，所以恢复本身也能撤销。 */
export async function restoreRevision(formData: FormData) {
  const admin = await requireAuth();
  const revisionId = Number(formData.get("revisionId"));
  const revision = revisionId
    ? await prisma.tutorialRevision.findUnique({
        where: { id: revisionId },
        include: { tutorial: { select: { id: true, slug: true, title: true, excerpt: true, content: true, cover: true, updatedAt: true } } },
      })
    : null;
  if (!revision) return;
  const { tutorial } = revision;
  await saveRevision(tutorial.id, tutorial, admin.username);
  await prisma.tutorial.update({
    where: { id: tutorial.id },
    data: {
      title: revision.title,
      excerpt: revision.excerpt,
      content: revision.content,
      thumbnail: await thumbnailFor(tutorial.cover ?? firstUploadedImage(revision.content)),
    },
  });
  await audit("tutorial.restore", {
    actor: admin.username,
    detail: `#${tutorial.id} ${revision.title}（恢复到 ${revision.savedAt.toISOString().slice(0, 16).replace("T", " ")} UTC 的版本）`,
  });
  revalidatePublic(tutorial.slug);
  revalidatePath(`/admin/tutorials/${tutorial.id}`);
  redirect(`/admin/tutorials/${tutorial.id}/revisions?restored=1`);
}
