import type { Metadata } from "next";
import Link from "next/link";
import { requireAdminPage } from "@/lib/admin-auth";
import { prisma } from "@/lib/prisma";
import { buildCategoryTree, flattenCategoryTree } from "@/lib/categories";
import BulkImport from "./bulk-import";

export const metadata: Metadata = { title: "批量导入" };

export const dynamic = "force-dynamic";

export default async function ImportPage() {
  await requireAdminPage();
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
          <h1 className="text-2xl font-bold text-ink">批量导入</h1>
          <p className="mt-1 text-sm text-ink-3">从 Hexo、Hugo、Jekyll、Obsidian 等 Markdown 文件夹，或者 WordPress 导出文件搬家过来</p>
        </div>
        <Link href="/admin/tutorials" className="text-sm text-accent-ink hover:underline">
          ← 返回教程管理
        </Link>
      </div>
      {categories.length === 0 ? (
        <p className="mt-6 rounded-2xl border border-line bg-surface p-5 text-sm text-ink-2">
          还没有分类，请先到 <Link href="/admin/categories" className="text-accent-ink hover:underline">分类管理</Link> 建一个。
        </p>
      ) : (
        <BulkImport categories={categories} />
      )}
    </div>
  );
}
