import type { Metadata } from "next";
import { prisma } from "@/lib/prisma";
import { CreateCategoryForm, CategoryRow } from "./category-forms";

export const metadata: Metadata = { title: "分类管理" };

export const dynamic = "force-dynamic";

export default async function AdminCategoriesPage() {
  const categories = await prisma.category.findMany({
    orderBy: { order: "asc" },
    include: { _count: { select: { tutorials: true } } },
  });

  return (
    <div>
      <h1 className="text-2xl font-bold text-ink">分类管理</h1>
      <p className="mt-1 text-sm text-ink-3">共 {categories.length} 个分类</p>

      <div className="mt-6 rounded-3xl border border-line bg-white p-6">
        <h2 className="text-sm font-bold text-ink">新建分类</h2>
        <CreateCategoryForm />
      </div>

      <div className="mt-5 space-y-3">
        {categories.map((c) => (
          <CategoryRow
            key={c.id}
            category={{
              id: c.id,
              name: c.name,
              slug: c.slug,
              description: c.description,
              icon: c.icon,
              color: c.color,
              order: c.order,
              tutorials: c._count.tutorials,
            }}
          />
        ))}
      </div>
    </div>
  );
}
