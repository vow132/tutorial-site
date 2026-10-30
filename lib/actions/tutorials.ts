"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/admin-auth";
import { audit } from "@/lib/audit";
import { sanitizeArticleHtml } from "@/lib/sanitize";

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

function revalidatePublic(slug?: string) {
  revalidatePath("/");
  revalidatePath("/tutorials");
  if (slug) revalidatePath(`/tutorials/${slug}`);
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

  await prisma.tutorial.update({ where: { id }, data: parsed.data });
  await audit("tutorial.update", { actor: admin.username, detail: `#${id} ${parsed.data.title}` });
  revalidatePublic(parsed.data.slug);
  redirect("/admin/tutorials");
}

export async function deleteTutorial(formData: FormData) {
  const admin = await requireAuth();
  const id = Number(formData.get("id"));
  if (!id) return;
  const deleted = await prisma.tutorial.delete({ where: { id } });
  await audit("tutorial.delete", { actor: admin.username, detail: `#${id} ${deleted.title}` });
  revalidatePublic();
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
