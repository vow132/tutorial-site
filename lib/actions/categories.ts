"use server";

import { revalidatePath, revalidateTag } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/admin-auth";
import { getAdminI18n } from "@/lib/i18n/server";
import { audit } from "@/lib/audit";
import { MAX_CATEGORY_LEVELS } from "@/lib/categories";
import { CACHE_TAGS } from "@/lib/public-data";
import { clearSearchCache } from "@/lib/search";
import type { Messages } from "@/lib/i18n/messages";
import { revalidateSitePath } from "@/lib/revalidate-public";

export type CategoryFormState = { error?: string; success?: string };

type CategoryRelation = { id: number; parentId: number | null };

function revalidate() {
  revalidateTag(CACHE_TAGS.categories, { expire: 0 });
  clearSearchCache();
  revalidatePath("/", "layout");
  revalidatePath("/admin/categories");
  revalidatePath("/admin/tutorials");
}

type Text = Messages["admin"]["categories"];

function parseParentId(formData: FormData, t: Text) {
  const value = String(formData.get("parentId") ?? "").trim();
  if (!value) return { parentId: null };
  const parentId = Number(value);
  return Number.isInteger(parentId) && parentId > 0
    ? { parentId }
    : { parentId: null, error: t.badParent };
}

function normalizeLinkUrl(rawValue: string, t: Text) {
  const value = rawValue.trim();
  if (!value) return { linkUrl: null };
  if (value.length > 500) return { linkUrl: null, error: t.linkTooLong };

  if (value.startsWith("/") && !value.startsWith("//")) {
    return { linkUrl: value };
  }

  try {
    const url = new URL(value);
    if (url.protocol === "http:" || url.protocol === "https:") {
      return { linkUrl: value };
    }
  } catch {
    // 统一在下方返回可读错误。
  }

  return {
    linkUrl: null,
    error: t.linkInvalid,
  };
}

function descendantIds(categories: CategoryRelation[], categoryId: number) {
  const result = new Set<number>();
  const queue = [categoryId];

  while (queue.length > 0) {
    const currentId = queue.shift()!;
    for (const category of categories) {
      if (category.parentId === currentId && !result.has(category.id)) {
        result.add(category.id);
        queue.push(category.id);
      }
    }
  }

  return result;
}

function categoryDepth(categories: CategoryRelation[], categoryId: number) {
  const byId = new Map(categories.map((category) => [category.id, category]));
  const visited = new Set<number>();
  let current = byId.get(categoryId);
  let depth = 0;

  while (current?.parentId) {
    if (visited.has(current.id)) return MAX_CATEGORY_LEVELS;
    visited.add(current.id);
    depth += 1;
    current = byId.get(current.parentId);
  }

  return depth;
}

function subtreeHeight(categories: CategoryRelation[], categoryId: number) {
  let maxHeight = 0;
  const queue: Array<{ id: number; height: number }> = [
    { id: categoryId, height: 0 },
  ];
  const visited = new Set<number>();

  while (queue.length > 0) {
    const current = queue.shift()!;
    if (visited.has(current.id)) continue;
    visited.add(current.id);
    maxHeight = Math.max(maxHeight, current.height);

    for (const category of categories) {
      if (category.parentId === current.id) {
        queue.push({ id: category.id, height: current.height + 1 });
      }
    }
  }

  return maxHeight;
}

function validateParent(
  categories: CategoryRelation[],
  categoryId: number | null,
  parentId: number | null,
  t: Text,
) {
  if (parentId === null) return null;
  const parent = categories.find((category) => category.id === parentId);
  if (!parent) return t.parentMissing;

  if (categoryId !== null) {
    if (categoryId === parentId) return t.parentSelf;
    if (descendantIds(categories, categoryId).has(parentId)) {
      return t.parentDescendant;
    }
  }

  const newDepth = categoryDepth(categories, parentId) + 1;
  const childHeight = categoryId === null ? 0 : subtreeHeight(categories, categoryId);
  if (newDepth + childHeight >= MAX_CATEGORY_LEVELS) {
    return t.tooDeep.replace("{max}", String(MAX_CATEGORY_LEVELS));
  }

  return null;
}

function readCommonFields(formData: FormData, t: Text) {
  const name = String(formData.get("name") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();
  const icon = String(formData.get("icon") ?? "").trim();
  const color = String(formData.get("color") ?? "#6366f1").trim();
  const link = normalizeLinkUrl(String(formData.get("linkUrl") ?? ""), t);

  if (!name) return { error: t.nameRequired };
  if (name.length > 60) return { error: t.nameTooLong };
  if (description.length > 300) return { error: t.descriptionTooLong };
  if (!/^#[0-9a-f]{6}$/i.test(color)) return { error: t.colorInvalid };
  if (link.error) return { error: link.error };

  return {
    data: {
      name,
      description: description || null,
      icon: icon || null,
      color,
      linkUrl: link.linkUrl,
    },
  };
}

export async function createCategory(
  _prev: CategoryFormState,
  formData: FormData,
): Promise<CategoryFormState> {
  const admin = await requireAuth("taxonomy");
  const t = (await getAdminI18n()).m.admin.categories;

  const common = readCommonFields(formData, t);
  if (common.error || !common.data) return { error: common.error };

  const slug = String(formData.get("slug") ?? "").trim().toLowerCase();
  if (!/^[a-z0-9-]+$/.test(slug)) {
    return { error: t.slugInvalid };
  }
  if (slug.length > 80) return { error: t.slugTooLong };

  const parent = parseParentId(formData, t);
  if (parent.error) return { error: parent.error };

  const [exists, categories] = await Promise.all([
    prisma.category.findUnique({ where: { slug }, select: { id: true } }),
    prisma.category.findMany({ select: { id: true, parentId: true } }),
  ]);
  if (exists) return { error: t.slugTaken };

  const parentError = validateParent(categories, null, parent.parentId, t);
  if (parentError) return { error: parentError };

  const maxOrder = await prisma.category.aggregate({
    where: { parentId: parent.parentId },
    _max: { order: true },
  });
  await prisma.category.create({
    data: {
      ...common.data,
      slug,
      parentId: parent.parentId,
      order: (maxOrder._max.order ?? 0) + 1,
    },
  });
  await audit("category.create", { actor: admin.username, detail: `${common.data.name} (${slug})` });
  revalidate();
  return { success: t.created };
}

export async function updateCategory(
  _prev: CategoryFormState,
  formData: FormData,
): Promise<CategoryFormState> {
  const admin = await requireAuth("taxonomy");
  const t = (await getAdminI18n()).m.admin.categories;

  const id = Number(formData.get("id"));
  if (!Number.isInteger(id) || id <= 0) return { error: t.badId };

  const common = readCommonFields(formData, t);
  if (common.error || !common.data) return { error: common.error };

  const slug = String(formData.get("slug") ?? "").trim().toLowerCase();
  if (!/^[a-z0-9-]+$/.test(slug)) {
    return { error: t.slugInvalid };
  }
  if (slug.length > 80) return { error: t.slugTooLong };

  const parent = parseParentId(formData, t);
  if (parent.error) return { error: parent.error };

  const orderValue = Number(formData.get("order") ?? 0);
  if (!Number.isFinite(orderValue)) return { error: t.orderInvalid };
  const order = Math.trunc(orderValue);

  const [current, categories, slugOwner] = await Promise.all([
    prisma.category.findUnique({ where: { id }, select: { slug: true } }),
    prisma.category.findMany({ select: { id: true, parentId: true } }),
    prisma.category.findUnique({ where: { slug }, select: { id: true } }),
  ]);
  if (!current || !categories.some((category) => category.id === id)) {
    return { error: t.gone };
  }
  if (slugOwner && slugOwner.id !== id) return { error: t.slugTakenOther };

  const parentError = validateParent(categories, id, parent.parentId, t);
  if (parentError) return { error: parentError };

  await prisma.category.update({
    where: { id },
    data: {
      ...common.data,
      slug,
      parentId: parent.parentId,
      order,
    },
  });
  await audit("category.update", { actor: admin.username, detail: `#${id} ${common.data.name} (${slug})` });
  if (current.slug !== slug) {
    revalidateSitePath(`/categories/${current.slug}`);
    revalidateSitePath(`/categories/${slug}`);
  }
  revalidate();
  return { success: (await getAdminI18n()).m.admin.common.saved };
}

export async function deleteCategory(
  _prev: CategoryFormState,
  formData: FormData,
): Promise<CategoryFormState> {
  const admin = await requireAuth("taxonomy");
  const { m, plural } = await getAdminI18n();
  const t = m.admin.categories;

  const id = Number(formData.get("id"));
  if (!Number.isInteger(id) || id <= 0) return { error: t.badId };

  const [tutorialCount, childCount] = await Promise.all([
    prisma.tutorial.count({ where: { categoryId: id } }),
    prisma.category.count({ where: { parentId: id } }),
  ]);
  if (tutorialCount > 0) {
    return { error: plural(tutorialCount, t.hasTutorials) };
  }
  if (childCount > 0) {
    return { error: plural(childCount, t.hasChildren) };
  }

  const deleted = await prisma.category.delete({ where: { id } });
  await audit("category.delete", { actor: admin.username, detail: `#${id} ${deleted.name}` });
  revalidate();
  return { success: t.deleted };
}
