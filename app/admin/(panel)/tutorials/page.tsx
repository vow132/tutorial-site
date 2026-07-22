import type { Metadata } from "next";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { deleteTutorial, togglePublish } from "@/lib/actions/tutorials";
import DeleteButton from "./delete-button";

export const metadata: Metadata = { title: "教程管理" };

export const dynamic = "force-dynamic";

export default async function AdminTutorialsPage() {
  const tutorials = await prisma.tutorial.findMany({
    orderBy: { updatedAt: "desc" },
    select: {
      id: true,
      title: true,
      slug: true,
      views: true,
      published: true,
      category: { select: { name: true, color: true } },
    },
  });

  return (
    <div>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-ink">教程管理</h1>
          <p className="mt-1 text-sm text-ink-3">共 {tutorials.length} 篇</p>
        </div>
        <Link
          href="/admin/tutorials/new"
          className="flex h-10 items-center gap-2 rounded-full bg-ink px-5 text-sm font-semibold text-white transition-opacity hover:opacity-90"
        >
          <svg width="13" height="13" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <path d="M7 1v12M1 7h12" />
          </svg>
          写教程
        </Link>
      </div>

      <div className="mt-6 overflow-hidden rounded-3xl border border-line bg-white">
        {tutorials.length === 0 ? (
          <p className="py-20 text-center text-sm text-ink-3">
            还没有教程，点击右上角开始创作
          </p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line text-left text-xs text-ink-3">
                <th className="px-6 py-3.5 font-medium">标题</th>
                <th className="hidden px-4 py-3.5 font-medium md:table-cell">分类</th>
                <th className="hidden px-4 py-3.5 font-medium sm:table-cell">阅读</th>
                <th className="px-4 py-3.5 font-medium">状态</th>
                <th className="px-6 py-3.5 text-right font-medium">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {tutorials.map((t) => (
                <tr key={t.id} className="transition-colors hover:bg-paper/60">
                  <td className="max-w-0 px-6 py-4">
                    <Link
                      href={`/admin/tutorials/${t.id}`}
                      className="block truncate font-semibold text-ink hover:text-accent"
                    >
                      {t.title}
                    </Link>
                    <span className="text-xs text-ink-3">/{t.slug}</span>
                  </td>
                  <td className="hidden whitespace-nowrap px-4 py-4 md:table-cell">
                    <span
                      className="inline-flex items-center gap-1.5 text-xs"
                      style={{ color: t.category.color }}
                    >
                      <span
                        className="h-1.5 w-1.5 rounded-full"
                        style={{ backgroundColor: t.category.color }}
                      />
                      {t.category.name}
                    </span>
                  </td>
                  <td className="hidden whitespace-nowrap px-4 py-4 text-ink-2 sm:table-cell">
                    {t.views}
                  </td>
                  <td className="whitespace-nowrap px-4 py-4">
                    <form action={togglePublish}>
                      <input type="hidden" name="id" value={t.id} />
                      <button
                        type="submit"
                        title="点击切换状态"
                        className={`rounded-full px-2.5 py-1 text-xs font-medium transition-opacity hover:opacity-70 ${
                          t.published
                            ? "bg-emerald-50 text-emerald-600"
                            : "bg-amber-50 text-amber-600"
                        }`}
                      >
                        {t.published ? "已发布" : "草稿"}
                      </button>
                    </form>
                  </td>
                  <td className="whitespace-nowrap px-6 py-4 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <Link
                        href={`/tutorials/${t.slug}`}
                        target="_blank"
                        className="rounded-lg px-2.5 py-1.5 text-xs text-ink-3 transition-colors hover:bg-paper hover:text-ink"
                      >
                        预览
                      </Link>
                      <Link
                        href={`/admin/tutorials/${t.id}`}
                        className="rounded-lg px-2.5 py-1.5 text-xs font-medium text-accent transition-colors hover:bg-accent-soft"
                      >
                        编辑
                      </Link>
                      <DeleteButton id={t.id} action={deleteTutorial} />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
