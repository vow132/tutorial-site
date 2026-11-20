import type { Metadata } from "next";
import Link from "next/link";
import { requireAdminPage } from "@/lib/admin-auth";
import { createSeries } from "@/lib/actions/series";
import { prisma } from "@/lib/prisma";
import SeriesForm from "./series-form";

export const metadata: Metadata = { title: "教程系列" };
export const dynamic = "force-dynamic";

export default async function AdminSeriesPage() {
  await requireAdminPage();
  const [series, published] = await Promise.all([
    prisma.series.findMany({
      orderBy: { createdAt: "desc" },
      select: { id: true, title: true, slug: true, _count: { select: { tutorials: true } } },
    }),
    prisma.tutorial.groupBy({ by: ["seriesId"], where: { published: true, seriesId: { not: null } }, _count: { id: true } }),
  ]);
  const publishedCount = new Map(published.map((row) => [row.seriesId, row._count.id]));

  return (
    <div className="max-w-4xl">
      <h1 className="text-2xl font-bold text-ink">教程系列</h1>
      <p className="mt-1 text-sm text-ink-3">
        把几篇教程按顺序组成一个系列（如「从零搭建博客」第 1–5 篇）。文章页会显示系列目录和本系列的上一篇/下一篇，
        每个系列还有自己的页面。
      </p>

      <section className="mt-6 rounded-3xl border border-line bg-surface p-5 sm:p-6" aria-labelledby="new-series">
        <h2 id="new-series" className="mb-4 text-base font-semibold text-ink">新建系列</h2>
        <SeriesForm action={createSeries} submitLabel="创建系列" />
      </section>

      {series.length === 0 ? (
        <div className="mt-6 rounded-3xl border border-dashed border-line bg-surface/60 py-12 text-center text-sm text-ink-3">
          还没有系列
        </div>
      ) : (
        <div className="mt-6 overflow-x-auto rounded-2xl border border-line bg-surface">
          <table className="w-full text-sm">
            <thead className="border-b border-line text-left text-xs text-ink-3">
              <tr>
                <th className="px-4 py-3 font-medium">名称</th>
                <th className="px-4 py-3 font-medium">教程数（已发布 / 全部）</th>
                <th className="px-4 py-3 font-medium">前台</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {series.map((item) => {
                const live = publishedCount.get(item.id) ?? 0;
                return (
                  <tr key={item.id}>
                    <td className="px-4 py-3">
                      <Link href={`/admin/series/${item.id}`} className="font-medium text-ink hover:text-accent-ink">
                        {item.title}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-ink-2">
                      {live} / {item._count.tutorials}
                    </td>
                    <td className="px-4 py-3">
                      {live > 0 ? (
                        <Link
                          href={`/series/${encodeURIComponent(item.slug)}`}
                          prefetch={false}
                          target="_blank"
                          className="text-xs text-accent-ink hover:underline"
                        >
                          /series/{item.slug}
                        </Link>
                      ) : (
                        <span className="text-xs text-ink-3">还没有已发布的教程</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
