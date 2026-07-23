"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/admin-auth";
import { MAX_CATEGORY_LEVELS } from "@/lib/categories";

export type CategoryFormState = { error?: string; success?: string };

type CategoryRelation = { id: number; parentId: number | null };

function revalidate() {
  revalidatePath("/", "layout");
  revalidatePath("/admin/categories");
  revalidatePath("/admin/tutorials");
}

function parseParentId(formData: FormData) {
  const value = String(formData.get("parentId") ?? "").trim();
  if (!value) return { parentId: null };
  const parentId = Number(value);
  return Number.isInteger(parentId) && parentId > 0
    ? { parentId }
    : { parentId: null, error: "父分类参数不正确" };
}

function normalizeLinkUrl(rawValue: string) {
  const value = rawValue.trim();
  if (!value) return { linkUrl: null };
  if (value.length > 500) return { linkUrl: null, error: "跳转链接过长" };

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
    error: "跳转链接需填写 /站内路径 或完整的 http(s) 地址",
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
) {
  if (parentId === null) return null;
  const parent = categories.find((category) => category.id === parentId);
  if (!parent) return "选择的父分类不存在";

  if (categoryId !== null) {
    if (categoryId === parentId) return "分类不能成为自己的父分类";
    if (descendantIds(categories, categoryId).has(parentId)) {
      return "不能把分类移动到自己的子分类下面";
    }
  }

  const newDepth = categoryDepth(categories, parentId) + 1;
  const childHeight = categoryId === null ? 0 : subtreeHeight(categories, categoryId);
  if (newDepth + childHeight >= MAX_CATEGORY_LEVELS) {
    return `分类最多支持 ${MAX_CATEGORY_LEVELS} 级，请选择更上层的父分类`;
  }

  return null;
}

function readCommonFields(formData: FormData) {
  const name = String(formData.get("name") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();
  const icon = String(formData.get("icon") ?? "").trim();
  const color = String(formData.get("color") ?? "#6366f1").trim();
  const link = normalizeLinkUrl(String(formData.get("linkUrl") ?? ""));

  if (!name) return { error: "请输入分类名称" };
  if (name.length > 60) return { error: "分类名称不能超过 60 个字符" };
  if (description.length > 300) return { error: "分类描述不能超过 300 个字符" };
  if (!/^#[0-9a-f]{6}$/i.test(color)) return { error: "主题色格式不正确" };
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
  await requireAuth();

  const common = readCommonFields(formData);
  if (common.error || !common.data) return { error: common.error };

  const slug = String(formData.get("slug") ?? "").trim().toLowerCase();
  if (!/^[a-z0-9-]+$/.test(slug)) {
    return { error: "Slug 只能包含小写字母、数字和连字符" };
  }
  if (slug.length > 80) return { error: "Slug 不能超过 80 个字符" };

  const parent = parseParentId(formData);
  if (parent.error) return { error: parent.error };

  const [exists, categories] = await Promise.all([
    prisma.category.findUnique({ where: { slug }, select: { id: true } }),
    prisma.category.findMany({ select: { id: true, parentId: true } }),
  ]);
  if (exists) return { error: "Slug 已被占用" };

  const parentError = validateParent(categories, null, parent.parentId);
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
  revalidate();
  return { success: "分类已创建" };
}

export async function updateCategory(
  _prev: CategoryFormState,
  formData: FormData,
): Promise<CategoryFormState> {
  await requireAuth();

  const id = Number(formData.get("id"));
  if (!Number.isInteger(id) || id <= 0) return { error: "分类参数不正确" };

  const common = readCommonFields(formData);
  if (common.error || !common.data) return { error: common.error };

  const slug = String(formData.get("slug") ?? "").trim().toLowerCase();
  if (!/^[a-z0-9-]+$/.test(slug)) {
    return { error: "Slug 只能包含小写字母、数字和连字符" };
  }
  if (slug.length > 80) return { error: "Slug 不能超过 80 个字符" };

  const parent = parseParentId(formData);
  if (parent.error) return { error: parent.error };

  const orderValue = Number(formData.get("order") ?? 0);
  if (!Number.isFinite(orderValue)) return { error: "排序值不正确" };
  const order = Math.trunc(orderValue);

  const [current, categories, slugOwner] = await Promise.all([
    prisma.category.findUnique({ where: { id }, select: { slug: true } }),
    prisma.category.findMany({ select: { id: true, parentId: true } }),
    prisma.category.findUnique({ where: { slug }, select: { id: true } }),
  ]);
  if (!current || !categories.some((category) => category.id === id)) {
    return { error: "分类不存在或已被删除" };
  }
  if (slugOwner && slugOwner.id !== id) return { error: "Slug 已被其他分类占用" };

  const parentError = validateParent(categories, id, parent.parentId);
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
  if (current.slug !== slug) {
    revalidatePath(`/categories/${current.slug}`);
    revalidatePath(`/categories/${slug}`);
  }
  revalidate();
  return { success: "已保存" };
}

export async function deleteCategory(
  _prev: CategoryFormState,
  formData: FormData,
): Promise<CategoryFormState> {
  await requireAuth();

  const id = Number(formData.get("id"));
  if (!Number.isInteger(id) || id <= 0) return { error: "参数错误" };

  const [tutorialCount, childCount] = await Promise.all([
    prisma.tutorial.count({ where: { categoryId: id } }),
    prisma.category.count({ where: { parentId: id } }),
  ]);
  if (tutorialCount > 0) {
    return { error: `该分类下还有 ${tutorialCount} 篇教程，请先移动或删除它们` };
  }
  if (childCount > 0) {
    return { error: `该分类下还有 ${childCount} 个子分类，请先移动或删除它们` };
  }

  await prisma.category.delete({ where: { id } });
  revalidate();
  return { success: "分类已删除" };
}
