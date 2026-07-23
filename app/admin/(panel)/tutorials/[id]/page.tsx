import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { updateTutorial } from "@/lib/actions/tutorials";
import { buildCategoryTree, flattenCategoryTree } from "@/lib/categories";
import TutorialForm from "../tutorial-form";

export const metadata: Metadata = { title: "编辑教程" };

export const dynamic = "force-dynamic";

export default async function EditTutorialPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const tutorial = await prisma.tutorial.findUnique({
    where: { id: Number(id) },
  });
  if (!tutorial) notFound();

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

  const boundAction = updateTutorial.bind(null, tutorial.id);

  return (
    <div>
      <h1 className="text-2xl font-bold text-ink">编辑教程</h1>
      <p className="mt-1 text-sm text-ink-3">/{tutorial.slug}</p>
      <div className="mt-6">
        <TutorialForm
          categories={categories}
          action={boundAction}
          initial={{
            title: tutorial.title,
            slug: tutorial.slug,
            excerpt: tutorial.excerpt,
            content: tutorial.content,
            categoryId: tutorial.categoryId,
            published: tutorial.published,
          }}
        />
      </div>
    </div>
  );
}
