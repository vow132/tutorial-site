"use server";

import { revalidatePath, revalidateTag } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/admin-auth";
import { audit } from "@/lib/audit";
import { sanitizeArticleHtml } from "@/lib/sanitize";
import { CACHE_TAGS } from "@/lib/public-data";
import { clearSearchCache } from "@/lib/search";

export type TutorialFormState = { error?: string };


function normalizeSlug(input: string, title: string) {
  const raw = (input || title).toLowerCase().trim();
  const slug = raw
    .replace(/[^a-z0-9一-龥]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
  return slug || `tutorial-${Date.now().toString(36)}`;
}

function parseForm(formData: FormData) {
  const title = String(formData.get("title") ?? "").trim();
  const excerpt = String(formData.get("excerpt") ?? "").trim();
  // 不信任客户端：Server Action 可被绕过编辑器直接调用，入库前按白名单过滤。
  const content = sanitizeArticleHtml(String(formData.get("content") ?? "")).trim();
  const categoryId = Number(formData.get("categoryId"));
  const published = formData.get("published") === "on";
  const slug = normalizeSlug(
    String(formData.get("slug") ?? "").trim(),
    title
  );

  if (!title) return { error: "请输入标题" as const };
  if (title.length > 200) return { error: "标题不能超过 200 个字符" as const };
  if (excerpt.length > 500) return { error: "摘要不能超过 500 个字符" as const };
  if (!content || content === "<p></p>") return { error: "正文不能为空" as const };
  if (!categoryId) return { error: "请选择分类" as const };

  return {
    data: { title, slug, excerpt: excerpt || null, content, categoryId, published },
  };
}

/**
 * 文章页是 ISR 缓存页：改 slug 时旧地址、删除时原地址都要显式失效，
 * 否则在 revalidate 周期内还会继续返回旧内容。
 */
function revalidatePublic(...slugs: (string | null | undefined)[]) {
  revalidateTag(CACHE_TAGS.tutorials, { expire: 0 });
  clearSearchCache();
  revalidatePath("/");
  revalidatePath("/tutorials");
  for (const slug of new Set(slugs.filter((item): item is string => Boolean(item)))) {
    // 中文 slug 的缓存键是编码后的路径；两种写法都失效一遍，确保命中。
    revalidatePath(`/tutorials/${slug}`);
    revalidatePath(`/tutorials/${encodeURIComponent(slug)}`);
  }
}

export async function createTutorial(
  _prev: TutorialFormState,
  formData: FormData
): Promise<TutorialFormState> {
  const admin = await requireAuth();
  const parsed = parseForm(formData);
  if ("error" in parsed) return { error: parsed.error };

  const exists = await prisma.tutorial.findUnique({
    where: { slug: parsed.data.slug },
  });
  if (exists) return { error: "Slug 已被占用，请更换" };

  const created = await prisma.tutorial.create({ data: parsed.data });
  await audit("tutorial.create", { actor: admin.username, detail: `#${created.id} ${created.title}` });
  revalidatePublic(created.slug);
  redirect("/admin/tutorials");
}

export async function updateTutorial(
  id: number,
  _prev: TutorialFormState,
  formData: FormData
): Promise<TutorialFormState> {
  const admin = await requireAuth();
  const parsed = parseForm(formData);
  if ("error" in parsed) return { error: parsed.error };

  const conflict = await prisma.tutorial.findFirst({
    where: { slug: parsed.data.slug, NOT: { id } },
  });
  if (conflict) return { error: "Slug 已被其他教程占用" };

  const before = await prisma.tutorial.findUnique({ where: { id }, select: { slug: true } });
  await prisma.tutorial.update({ where: { id }, data: parsed.data });
  await audit("tutorial.update", { actor: admin.username, detail: `#${id} ${parsed.data.title}` });
  revalidatePublic(before?.slug, parsed.data.slug);
  redirect("/admin/tutorials");
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
    data: { published: !t.published },
  });
  await audit(t.published ? "tutorial.unpublish" : "tutorial.publish", {
    actor: admin.username,
    detail: `#${id} ${t.title}`,
  });
  revalidatePublic(t.slug);
  revalidatePath("/admin/tutorials");
}
