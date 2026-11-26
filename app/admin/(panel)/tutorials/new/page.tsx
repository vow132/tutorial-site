import type { Metadata } from "next";
import { requireAdminPage } from "@/lib/admin-auth";
import { can } from "@/lib/roles";
import { prisma } from "@/lib/prisma";
import { createTutorial } from "@/lib/actions/tutorials";
import { buildCategoryTree, flattenCategoryTree } from "@/lib/categories";
import { tagSuggestions } from "@/lib/tag-sync";
import { authorOptions } from "@/lib/authors";
import TutorialForm from "../tutorial-form";

export const metadata: Metadata = { title: "写教程" };

export const dynamic = "force-dynamic";

export default async function NewTutorialPage() {
  const admin = await requireAdminPage("tutorials");
  const [categoryRows, suggestions, series, authors] = await Promise.all([
    prisma.category.findMany({
      orderBy: [{ order: "asc" }, { id: "asc" }],
      select: { id: true, name: true, parentId: true, order: true },
    }),
    tagSuggestions(),
    prisma.series.findMany({ orderBy: { createdAt: "desc" }, select: { id: true, title: true } }),
    authorOptions(admin),
  ]);
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
        <TutorialForm
          draftKey="new"
          categories={categories}
          series={series}
          authors={authors}
          authorId={admin.id}
          mediaLibrary={can(admin.role, "media")}
          tagSuggestions={suggestions}
          action={createTutorial}
        />
      </div>
    </div>
  );
}
