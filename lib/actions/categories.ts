"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/admin-auth";

export type CategoryFormState = { error?: string; success?: string };


function revalidate() {
  revalidatePath("/");
  revalidatePath("/admin/categories");
}

export async function createCategory(
  _prev: CategoryFormState,
  formData: FormData
): Promise<CategoryFormState> {
  await requireAuth();

  const name = String(formData.get("name") ?? "").trim();
  const slug = String(formData.get("slug") ?? "").trim().toLowerCase();
  const description = String(formData.get("description") ?? "").trim();
  const icon = String(formData.get("icon") ?? "").trim();
  const color = String(formData.get("color") ?? "#6366f1").trim();

  if (!name) return { error: "请输入分类名称" };
  if (!/^[a-z0-9-]+$/.test(slug)) {
    return { error: "Slug 只能包含小写字母、数字和连字符" };
  }

  const exists = await prisma.category.findUnique({ where: { slug } });
  if (exists) return { error: "Slug 已被占用" };

  const maxOrder = await prisma.category.aggregate({ _max: { order: true } });
  await prisma.category.create({
    data: {
      name,
      slug,
      description: description || null,
      icon: icon || null,
      color,
      order: (maxOrder._max.order ?? 0) + 1,
    },
  });
  revalidate();
  return { success: "分类已创建" };
}

export async function updateCategory(
  _prev: CategoryFormState,
  formData: FormData
): Promise<CategoryFormState> {
  await requireAuth();

  const id = Number(formData.get("id"));
  const name = String(formData.get("name") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();
  const icon = String(formData.get("icon") ?? "").trim();
  const color = String(formData.get("color") ?? "#6366f1").trim();
  const order = Number(formData.get("order") ?? 0);

  if (!id || !name) return { error: "分类名称不能为空" };

  await prisma.category.update({
    where: { id },
    data: { name, description: description || null, icon: icon || null, color, order },
  });
  revalidate();
  return { success: "已保存" };
}

export async function deleteCategory(
  _prev: CategoryFormState,
  formData: FormData
): Promise<CategoryFormState> {
  await requireAuth();

  const id = Number(formData.get("id"));
  if (!id) return { error: "参数错误" };

  const count = await prisma.tutorial.count({ where: { categoryId: id } });
  if (count > 0) {
    return { error: `该分类下还有 ${count} 篇教程，请先移动或删除它们` };
  }

  await prisma.category.delete({ where: { id } });
  revalidate();
  return { success: "分类已删除" };
}
