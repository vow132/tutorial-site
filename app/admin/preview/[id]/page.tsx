import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import ArticleEnhancer from "@/components/article-enhancer";
import { requireAdminPage } from "@/lib/admin-auth";
import { processArticle, uploadedImage } from "@/lib/article";
import { prisma } from "@/lib/prisma";

export const metadata: Metadata = { title: "预览" };
export const dynamic = "force-dynamic";

const formatDate = (date: Date) =>
  date.toLocaleString("zh-CN", { dateStyle: "long", timeStyle: "short", timeZone: "Asia/Shanghai" });

/**
 * 后台预览：按前台文章页的排版显示已保存的内容，草稿、定时发布的教程也能看。
 * 只有登录的管理员能访问（/admin 路径由 proxy 和 requireAdminPage 双重把关），不会被收录。
 */
export default async function PreviewPage({ params }: { params: Promise<{ id: string }> }) {
  await requireAdminPage();
  const { id } = await params;
  const tutorial = await prisma.tutorial.findUnique({
    where: { id: Number(id) || 0 },
    include: {
      category: true,
      tags: { orderBy: { position: "asc" }, select: { tag: { select: { name: true } } } },
    },
  });
  if (!tutorial) notFound();
  const [{ html }, cover] = await Promise.all([
    processArticle(tutorial.content),
    tutorial.cover ? uploadedImage(tutorial.cover) : null,
  ]);
  const status = tutorial.published
    ? "已发布"
    : tutorial.publishAt
      ? `定时发布：${formatDate(tutorial.publishAt)}`
      : "草稿（前台看不到）";

  return (
    <div className="min-h-screen bg-paper">
      <div className="sticky top-0 z-40 border-b border-amber-500/30 bg-amber-50 px-4 py-2.5 text-sm text-amber-900 dark:bg-amber-950 dark:text-amber-100">
        <div className="mx-auto flex max-w-3xl flex-wrap items-center justify-between gap-2">
          <span>
            <strong>预览模式</strong> · {status} · 显示的是最后一次保存的内容
          </span>
          <span className="flex gap-3">
            {tutorial.published && (
              <Link href={`/tutorials/${tutorial.slug}`} prefetch={false} className="underline">
                打开前台页面
              </Link>
            )}
            <Link href={`/admin/tutorials/${tutorial.id}`} className="underline">
              返回编辑
            </Link>
          </span>
        </div>
      </div>
      <div className="mx-auto max-w-3xl px-4 pb-24 pt-10">
        <ArticleEnhancer />
        <span className="inline-flex items-center gap-1.5 rounded-full bg-surface px-3 py-1 text-xs font-medium text-ink-2">
          <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: tutorial.category.color }} />
          {tutorial.category.name}
        </span>
        <h1 className="mt-4 text-3xl font-extrabold leading-tight text-ink md:text-4xl">{tutorial.title}</h1>
        <p className="mt-4 text-xs text-ink-3">最后保存于 {formatDate(tutorial.updatedAt)}</p>
        {tutorial.tags.length > 0 && (
          <p className="mt-3 flex flex-wrap gap-2 text-xs text-ink-2">
            {tutorial.tags.map(({ tag }) => (
              <span key={tag.name} className="rounded-full border border-line bg-surface px-3 py-1">
                #{tag.name}
              </span>
            ))}
          </p>
        )}
        {tutorial.cover && cover && (
          // eslint-disable-next-line @next/next/no-img-element -- 上传目录的静态文件
          <img
            src={tutorial.cover}
            srcSet={cover.srcSet}
            width={cover.width}
            height={cover.height}
            alt={tutorial.title}
            className="mt-8 aspect-video w-full rounded-2xl border border-line bg-paper object-cover"
          />
        )}
        <article className="article-body mt-8" dangerouslySetInnerHTML={{ __html: html }} />
      </div>
    </div>
  );
}
