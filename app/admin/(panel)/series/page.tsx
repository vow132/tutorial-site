import type { Metadata } from "next";
import Link from "next/link";
import { requireAdminPage } from "@/lib/admin-auth";
import { createSeries } from "@/lib/actions/series";
import { prisma } from "@/lib/prisma";
import SeriesForm from "./series-form";
import { getAdminI18n } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const { m } = await getAdminI18n();
  return { title: m.admin.series.metaTitle };
}
export const dynamic = "force-dynamic";

export default async function AdminSeriesPage() {
  await requireAdminPage("taxonomy");
  const t = (await getAdminI18n()).m.admin.series;
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
      <h1 className="text-2xl font-bold text-ink">{t.heading}</h1>
      <p className="mt-1 text-sm text-ink-3">{t.intro}</p>

      <section className="mt-6 rounded-3xl border border-line bg-surface p-5 sm:p-6" aria-labelledby="new-series">
        <h2 id="new-series" className="mb-4 text-base font-semibold text-ink">{t.newHeading}</h2>
        <SeriesForm action={createSeries} submitLabel={t.create} />
      </section>

      {series.length === 0 ? (
        <div className="mt-6 rounded-3xl border border-dashed border-line bg-surface/60 py-12 text-center text-sm text-ink-3">
          {t.empty}
        </div>
      ) : (
        <div className="mt-6 overflow-x-auto rounded-2xl border border-line bg-surface">
          <table className="w-full text-sm">
            <thead className="border-b border-line text-left text-xs text-ink-3">
              <tr>
                <th className="px-4 py-3 font-medium">{t.colName}</th>
                <th className="px-4 py-3 font-medium">{t.colCount}</th>
                <th className="px-4 py-3 font-medium">{t.colPublic}</th>
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
                        <span className="text-xs text-ink-3">{t.noPublished}</span>
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
