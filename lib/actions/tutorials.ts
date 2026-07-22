"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { SESSION_COOKIE, verifySession } from "@/lib/session";

export type TutorialFormState = { error?: string };

async function requireAuth() {
  const store = await cookies();
  if (!verifySession(store.get(SESSION_COOKIE)?.value)) {
    throw new Error("未登录或会话已过期");
  }
}

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
  const content = String(formData.get("content") ?? "").trim();
  const categoryId = Number(formData.get("categoryId"));
  const published = formData.get("published") === "on";
  const slug = normalizeSlug(
    String(formData.get("slug") ?? "").trim(),
    title
  );

  if (!title) return { error: "请输入标题" as const };
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
  await requireAuth();
  const parsed = parseForm(formData);
  if ("error" in parsed) return { error: parsed.error };

  const exists = await prisma.tutorial.findUnique({
    where: { slug: parsed.data.slug },
  });
  if (exists) return { error: "Slug 已被占用，请更换" };

  const created = await prisma.tutorial.create({ data: parsed.data });
  revalidatePublic(created.slug);
  redirect("/admin/tutorials");
}

export async function updateTutorial(
  id: number,
  _prev: TutorialFormState,
  formData: FormData
): Promise<TutorialFormState> {
  await requireAuth();
  const parsed = parseForm(formData);
  if ("error" in parsed) return { error: parsed.error };

  const conflict = await prisma.tutorial.findFirst({
    where: { slug: parsed.data.slug, NOT: { id } },
  });
  if (conflict) return { error: "Slug 已被其他教程占用" };

  await prisma.tutorial.update({ where: { id }, data: parsed.data });
  revalidatePublic(parsed.data.slug);
  redirect("/admin/tutorials");
}

export async function deleteTutorial(formData: FormData) {
  await requireAuth();
  const id = Number(formData.get("id"));
  if (!id) return;
  await prisma.tutorial.delete({ where: { id } });
  revalidatePublic();
  revalidatePath("/admin/tutorials");
}

export async function togglePublish(formData: FormData) {
  await requireAuth();
  const id = Number(formData.get("id"));
  if (!id) return;
  const t = await prisma.tutorial.findUnique({ where: { id } });
  if (!t) return;
  await prisma.tutorial.update({
    where: { id },
    data: { published: !t.published },
  });
  revalidatePublic(t.slug);
  revalidatePath("/admin/tutorials");
}
