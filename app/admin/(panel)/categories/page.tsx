import type { Metadata } from "next";
import { prisma } from "@/lib/prisma";
import {
  buildCategoryTree,
  flattenCategoryTree,
  getCategoryDescendantIds,
} from "@/lib/categories";
import {
  CreateCategoryForm,
  CategoryRow,
  type ParentOption,
} from "./category-forms";

export const metadata: Metadata = { title: "分类管理" };

export const dynamic = "force-dynamic";

export default async function AdminCategoriesPage() {
  const categories = await prisma.category.findMany({
    orderBy: [{ order: "asc" }, { id: "asc" }],
    include: { _count: { select: { tutorials: true } } },
  });
  const flattened = flattenCategoryTree(buildCategoryTree(categories));
  const parentOptions: ParentOption[] = flattened.map(({ node, depth }) => ({
    id: node.id,
    name: node.name,
    depth,
  }));
  const names = new Map(categories.map((category) => [category.id, category.name]));

  return (
    <div>
      <h1 className="text-2xl font-bold text-ink">分类管理</h1>
      <p className="mt-1 text-sm text-ink-3">共 {categories.length} 个分类</p>

      <div className="mt-6 rounded-3xl border border-line bg-white p-6">
        <h2 className="text-sm font-bold text-ink">新建分类</h2>
        <p className="mt-1 text-xs text-ink-3">
          最多三级；选择父分类即可创建二级或三级分类。
        </p>
        <CreateCategoryForm parentOptions={parentOptions} />
      </div>

      <div className="mt-5 space-y-3">
        {flattened.map(({ node: c, depth }) => (
          <CategoryRow
            key={c.id}
            parentOptions={parentOptions}
            category={{
              id: c.id,
              name: c.name,
              slug: c.slug,
              description: c.description,
              icon: c.icon,
              color: c.color,
              order: c.order,
              linkUrl: c.linkUrl,
              parentId: c.parentId,
              parentName: c.parentId ? (names.get(c.parentId) ?? null) : null,
              depth,
              children: c.children.length,
              descendantIds: getCategoryDescendantIds(c),
              tutorials: c._count.tutorials,
            }}
          />
        ))}
      </div>
    </div>
  );
}
