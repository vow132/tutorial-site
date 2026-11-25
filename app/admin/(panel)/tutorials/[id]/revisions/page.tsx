import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { requireAdminPage } from "@/lib/admin-auth";
import { processArticle, stripHtml } from "@/lib/article";
import { prisma } from "@/lib/prisma";
import { MAX_REVISIONS } from "@/lib/revisions";
import RestoreButton from "./restore-button";
import { canEditTutorial } from "@/lib/roles";

export const metadata: Metadata = { title: "历史版本" };
export const dynamic = "force-dynamic";

const formatDate = (date: Date) =>
  date.toLocaleString("zh-CN", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Shanghai" });

const length = (html: string) => stripHtml(html, Number.MAX_SAFE_INTEGER).length;

export default async function RevisionsPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ restored?: string }>;
}) {
  const admin = await requireAdminPage("tutorials");
  const { id } = await params;
  const { restored } = await searchParams;
  const tutorial = await prisma.tutorial.findUnique({
    where: { id: Number(id) || 0 },
    select: { id: true, title: true, content: true, updatedAt: true, authorId: true },
  });
  if (!tutorial) notFound();
  if (!canEditTutorial(admin, tutorial)) redirect("/admin/tutorials?forbidden=1");
  const revisions = await prisma.tutorialRevision.findMany({
    where: { tutorialId: tutorial.id },
    orderBy: [{ savedAt: "desc" }, { id: "desc" }],
  });
  const currentLength = length(tutorial.content);
  const previews = await Promise.all(revisions.map((revision) => processArticle(revision.content)));

  return (
    <div className="max-w-4xl">
      <Link href={`/admin/tutorials/${tutorial.id}`} className="text-sm text-ink-3 hover:text-ink">
        ← 返回编辑
      </Link>
      <h1 className="mt-3 text-2xl font-bold text-ink">历史版本</h1>
      <p className="mt-1 text-sm text-ink-3">
        「{tutorial.title}」每次保存前会自动留一份旧版本（最多 {MAX_REVISIONS} 个）。恢复时当前内容也会先存成历史版本，所以恢复本身也能撤销。
      </p>
      {restored && (
        <p role="status" className="mt-4 rounded-xl bg-emerald-500/10 px-4 py-3 text-sm text-emerald-600 dark:text-emerald-400">
          已恢复，前台已更新。原来的内容在下面的列表里。
        </p>
      )}

      <div className="mt-6 rounded-2xl border border-accent/30 bg-accent-soft/40 px-5 py-4 text-sm">
        <span className="font-semibold text-ink">当前版本</span>
        <span className="ml-3 text-ink-3">保存于 {formatDate(tutorial.updatedAt)} · {currentLength} 字</span>
      </div>

      {revisions.length === 0 ? (
        <p className="mt-6 rounded-2xl border border-dashed border-line py-12 text-center text-sm text-ink-3">
          还没有历史版本。修改并保存这篇教程后，旧内容会出现在这里。
        </p>
      ) : (
        <ol className="mt-4 space-y-3">
          {revisions.map((revision, index) => {
            const size = length(revision.content);
            const diff = currentLength - size;
            return (
              <li key={revision.id} className="rounded-2xl border border-line bg-surface">
                <details>
                  <summary className="flex cursor-pointer flex-wrap items-center gap-x-4 gap-y-1 px-5 py-4 text-sm">
                    <span className="font-medium text-ink">保存于 {formatDate(revision.savedAt)}</span>
                    <span className="text-ink-3">
                      {size} 字（当前版本{diff === 0 ? "字数相同" : diff > 0 ? `多 ${diff} 字` : `少 ${-diff} 字`}）
                    </span>
                    {revision.title !== tutorial.title && <span className="text-ink-3">标题：{revision.title}</span>}
                    {revision.replacedBy && <span className="text-ink-3">被 {revision.replacedBy} 修改</span>}
                  </summary>
                  <div className="border-t border-line px-5 py-4">
                    <div className="mb-4 flex justify-end">
                      <RestoreButton revisionId={revision.id} />
                    </div>
                    <h2 className="text-xl font-bold text-ink">{revision.title}</h2>
                    <div className="article-body mt-4" dangerouslySetInnerHTML={{ __html: previews[index].html }} />
                  </div>
                </details>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}
