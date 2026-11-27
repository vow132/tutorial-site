import type { Metadata } from "next";
import { requireAdminPage } from "@/lib/admin-auth";
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
import { getAdminI18n } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const { m } = await getAdminI18n();
  return { title: m.admin.categories.metaTitle };
}

export const dynamic = "force-dynamic";

export default async function AdminCategoriesPage() {
  await requireAdminPage("taxonomy");
  const { m, plural } = await getAdminI18n();
  const t = m.admin.categories;
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
      <h1 className="text-2xl font-bold text-ink">{t.heading}</h1>
      <p className="mt-1 text-sm text-ink-3">{plural(categories.length, t.count)}</p>

      <div className="mt-6 rounded-3xl border border-line bg-surface p-6">
        <h2 className="text-sm font-bold text-ink">{t.newHeading}</h2>
        <p className="mt-1 text-xs text-ink-3">{t.newHint}</p>
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
