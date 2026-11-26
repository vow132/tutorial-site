import type { Metadata } from "next";
import { requireAdminPage } from "@/lib/admin-auth";
import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { updateTutorial } from "@/lib/actions/tutorials";
import { buildCategoryTree, flattenCategoryTree } from "@/lib/categories";
import { tagSuggestions, tutorialTagNames } from "@/lib/tag-sync";
import TutorialForm from "../tutorial-form";
import { can, canEditTutorial } from "@/lib/roles";
import { authorOptions } from "@/lib/authors";

export const metadata: Metadata = { title: "编辑教程" };

export const dynamic = "force-dynamic";

export default async function EditTutorialPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const admin = await requireAdminPage("tutorials");
  const { id } = await params;
  const tutorial = await prisma.tutorial.findUnique({
    where: { id: Number(id) },
  });
  if (!tutorial) notFound();
  // 作者只能编辑自己的教程
  if (!canEditTutorial(admin, tutorial)) redirect("/admin/tutorials?forbidden=1");

  const [categoryRows, suggestions, tags, revisionCount, series, authors] = await Promise.all([
    prisma.category.findMany({
      orderBy: [{ order: "asc" }, { id: "asc" }],
      select: { id: true, name: true, parentId: true, order: true },
    }),
    tagSuggestions(),
    tutorialTagNames(tutorial.id),
    prisma.tutorialRevision.count({ where: { tutorialId: tutorial.id } }),
    prisma.series.findMany({ orderBy: { createdAt: "desc" }, select: { id: true, title: true } }),
    authorOptions(admin),
  ]);
  const categories = flattenCategoryTree(buildCategoryTree(categoryRows)).map(
    ({ node, depth }) => ({
      id: node.id,
      name: `${"　".repeat(depth)}${node.name}（${depth + 1}级）`,
    }),
  );

  const boundAction = updateTutorial.bind(null, tutorial.id);

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-ink">编辑教程</h1>
          <p className="mt-1 text-sm text-ink-3">/{tutorial.slug}</p>
        </div>
        <div className="flex items-center gap-2 text-sm">
          <Link
            href={`/admin/preview/${tutorial.id}`}
            target="_blank"
            prefetch={false}
            className="rounded-full border border-line px-4 py-2 text-ink-2 transition-colors hover:bg-paper hover:text-ink"
          >
            预览已保存的版本
          </Link>
          <a
            href={`/admin/tutorials/${tutorial.id}/markdown`}
            download
            className="rounded-full border border-line px-4 py-2 text-ink-2 transition-colors hover:bg-paper hover:text-ink"
          >
            导出 Markdown
          </a>
          <Link
            href={`/admin/tutorials/${tutorial.id}/revisions`}
            className="rounded-full border border-line px-4 py-2 text-ink-2 transition-colors hover:bg-paper hover:text-ink"
          >
            历史版本（{revisionCount}）
          </Link>
        </div>
      </div>
      <div className="mt-6">
        <TutorialForm
          draftKey={String(tutorial.id)}
          serverUpdatedAt={tutorial.updatedAt.toISOString()}
          categories={categories}
          series={series}
          authors={authors}
          authorId={tutorial.authorId}
          mediaLibrary={can(admin.role, "media")}
          tagSuggestions={suggestions}
          action={boundAction}
          initial={{
            title: tutorial.title,
            slug: tutorial.slug,
            excerpt: tutorial.excerpt,
            content: tutorial.content,
            categoryId: tutorial.categoryId,
            seriesId: tutorial.seriesId,
            published: tutorial.published,
            publishAt: tutorial.publishAt?.toISOString() ?? null,
            cover: tutorial.cover,
            tags,
          }}
        />
      </div>
    </div>
  );
}
