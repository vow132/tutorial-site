import type { Metadata } from "next";
import Link from "next/link";
import { requireAdminPage } from "@/lib/admin-auth";
import { prisma } from "@/lib/prisma";
import { buildCategoryTree, flattenCategoryTree } from "@/lib/categories";
import BulkImport from "./bulk-import";
import { getAdminI18n } from "@/lib/i18n/server";
import { rich } from "@/lib/i18n/rich";

export async function generateMetadata(): Promise<Metadata> {
  const { m } = await getAdminI18n();
  return { title: m.admin.bulkImport.metaTitle };
}

export const dynamic = "force-dynamic";

export default async function ImportPage() {
  await requireAdminPage("import");
  const t = (await getAdminI18n()).m.admin.bulkImport;
  const rows = await prisma.category.findMany({
    orderBy: [{ order: "asc" }, { id: "asc" }],
    select: { id: true, name: true, slug: true, parentId: true, order: true },
  });
  const categories = flattenCategoryTree(buildCategoryTree(rows)).map(({ node, depth }) => ({
    id: node.id,
    name: node.name,
    slug: rows.find((row) => row.id === node.id)?.slug ?? "",
    label: `${"　".repeat(depth)}${node.name}`,
  }));

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-ink">{t.heading}</h1>
          <p className="mt-1 text-sm text-ink-3">{t.intro}</p>
        </div>
        <Link href="/admin/tutorials" className="text-sm text-accent-ink hover:underline">
          {t.back}
        </Link>
      </div>
      {categories.length === 0 ? (
        <p className="mt-6 rounded-2xl border border-line bg-surface p-5 text-sm text-ink-2">
          {rich(t.noCategories, {
            link: (
              <Link href="/admin/categories" className="text-accent-ink hover:underline">
                {t.categoriesLink}
              </Link>
            ),
          })}
        </p>
      ) : (
        <BulkImport categories={categories} />
      )}
    </div>
  );
}
