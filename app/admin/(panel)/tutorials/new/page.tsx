import type { Metadata } from "next";
import { prisma } from "@/lib/prisma";
import { createTutorial } from "@/lib/actions/tutorials";
import { buildCategoryTree, flattenCategoryTree } from "@/lib/categories";
import TutorialForm from "../tutorial-form";

export const metadata: Metadata = { title: "写教程" };

export const dynamic = "force-dynamic";

export default async function NewTutorialPage() {
  const categoryRows = await prisma.category.findMany({
    orderBy: [{ order: "asc" }, { id: "asc" }],
    select: { id: true, name: true, parentId: true, order: true },
  });
  const categories = flattenCategoryTree(buildCategoryTree(categoryRows)).map(
    ({ node, depth }) => ({
      id: node.id,
      name: `${"　".repeat(depth)}${node.name}（${depth + 1}级）`,
    }),
  );

  return (
    <div>
      <h1 className="text-2xl font-bold text-ink">写教程</h1>
      <p className="mt-1 text-sm text-ink-3">
        像使用 Word 一样撰写，图片可直接拖入正文
      </p>
      <div className="mt-6">
        <TutorialForm categories={categories} action={createTutorial} />
      </div>
    </div>
  );
}
