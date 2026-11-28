import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdminPage } from "@/lib/admin-auth";
import { updateSeries } from "@/lib/actions/series";
import { prisma } from "@/lib/prisma";
import { seriesPath } from "@/lib/series";
import SeriesForm from "../series-form";
import { AddToSeriesForm, ChapterForm, DeleteSeriesButton, SeriesItemActions } from "./series-actions";
import { getAdminI18n } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const { m } = await getAdminI18n();
  return { title: m.admin.series.editMetaTitle };
}
export const dynamic = "force-dynamic";

export default async function EditSeriesPage({ params }: { params: Promise<{ id: string }> }) {
  await requireAdminPage("taxonomy");
  const { m, plural } = await getAdminI18n();
  const t = m.admin.series;
  const { id } = await params;
  const series = await prisma.series.findUnique({
    where: { id: Number(id) || 0 },
    include: {
      tutorials: {
        orderBy: [{ seriesOrder: "asc" }, { createdAt: "asc" }],
        select: { id: true, title: true, published: true, seriesChapter: true },
      },
    },
  });
  if (!series) notFound();
  const candidates = await prisma.tutorial.findMany({
    where: { OR: [{ seriesId: null }, { seriesId: { not: series.id } }] },
    orderBy: { updatedAt: "desc" },
    take: 500,
    select: { id: true, title: true, published: true, series: { select: { title: true } } },
  });
  const publishedCount = series.tutorials.filter((t) => t.published).length;

  return (
    <div className="max-w-4xl">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <Link href="/admin/series" className="text-sm text-ink-3 hover:text-ink">
            {t.back}
          </Link>
          <h1 className="mt-2 text-2xl font-bold text-ink">{series.title}</h1>
        </div>
        <div className="flex items-center gap-2">
          {publishedCount > 0 && (
            <Link
              href={seriesPath(series.slug)}
              prefetch={false}
              target="_blank"
              className="rounded-full border border-line px-4 py-2 text-sm text-ink-2 transition-colors hover:bg-paper hover:text-ink"
            >
              {t.viewPage}
            </Link>
          )}
          <DeleteSeriesButton id={series.id} title={series.title} />
        </div>
      </div>

      <section className="mt-6 rounded-3xl border border-line bg-surface p-5 sm:p-6" aria-labelledby="series-info">
        <h2 id="series-info" className="mb-4 text-base font-semibold text-ink">{t.info}</h2>
        <SeriesForm
          action={updateSeries.bind(null, series.id)}
          initial={{ title: series.title, slug: series.slug, description: series.description }}
          submitLabel={m.admin.common.save}
        />
      </section>

      <section className="mt-6 rounded-3xl border border-line bg-surface p-5 sm:p-6" aria-labelledby="series-items">
        <h2 id="series-items" className="text-base font-semibold text-ink">
          {t.order} <span className="text-sm font-normal text-ink-3">{plural(series.tutorials.length, t.orderCount)}</span>
        </h2>
        <p className="mt-1 text-xs text-ink-3">
          {t.chaptersHint}
        </p>
        <datalist id="series-chapters">
          {[...new Set(series.tutorials.map((t) => t.seriesChapter).filter((c): c is string => Boolean(c)))].map((chapter) => (
            <option key={chapter} value={chapter} />
          ))}
        </datalist>
        {series.tutorials.length === 0 ? (
          <p className="mt-4 text-sm text-ink-3">{t.noTutorials}</p>
        ) : (
          <ol className="mt-4 divide-y divide-line rounded-2xl border border-line">
            {series.tutorials.map((tutorial, index) => (
              <li key={tutorial.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                <span className="w-6 shrink-0 text-sm text-ink-3 tabular-nums">{index + 1}</span>
                <Link href={`/admin/tutorials/${tutorial.id}`} className="min-w-0 flex-1 truncate text-sm font-medium text-ink hover:text-accent-ink">
                  {tutorial.title}
                </Link>
                {!tutorial.published && (
                  <span className="shrink-0 rounded-full bg-amber-500/10 px-2 py-0.5 text-xs text-amber-600 dark:text-amber-400">{t.draft}</span>
                )}
                <ChapterForm tutorialId={tutorial.id} title={tutorial.title} initial={tutorial.seriesChapter ?? ""} listId="series-chapters" />
                <SeriesItemActions
                  tutorialId={tutorial.id}
                  title={tutorial.title}
                  first={index === 0}
                  last={index === series.tutorials.length - 1}
                />
              </li>
            ))}
          </ol>
        )}
        <div className="mt-4">
          <AddToSeriesForm
            seriesId={series.id}
            options={candidates.map((t) => ({ id: t.id, title: t.title, published: t.published, seriesTitle: t.series?.title ?? null }))}
          />
        </div>
      </section>
    </div>
  );
}
