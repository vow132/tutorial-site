import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { requireAdminPage } from "@/lib/admin-auth";
import { processArticle, stripHtml } from "@/lib/article";
import { prisma } from "@/lib/prisma";
import { MAX_REVISIONS } from "@/lib/revisions";
import RestoreButton from "./restore-button";
import { canEditTutorial } from "@/lib/roles";
import { getAdminI18n } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const { m } = await getAdminI18n();
  return { title: m.admin.revisions.metaTitle };
}
export const dynamic = "force-dynamic";

const DATE_TIME: Intl.DateTimeFormatOptions = { dateStyle: "medium", timeStyle: "short" };

const length = (html: string) => stripHtml(html, Number.MAX_SAFE_INTEGER).length;

export default async function RevisionsPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ restored?: string }>;
}) {
  const admin = await requireAdminPage("tutorials");
  const { m, f, plural, date } = await getAdminI18n();
  const t = m.admin.revisions;
  const formatDate = (value: Date) => date(value, DATE_TIME);
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
  const previews = await Promise.all(revisions.map((revision) => processArticle(revision.content, m.site.articleHtml)));

  return (
    <div className="max-w-4xl">
      <Link href={`/admin/tutorials/${tutorial.id}`} className="text-sm text-ink-3 hover:text-ink">
        {t.back}
      </Link>
      <h1 className="mt-3 text-2xl font-bold text-ink">{t.heading}</h1>
      <p className="mt-1 text-sm text-ink-3">
        {f(t.intro, { title: tutorial.title, n: MAX_REVISIONS })}
      </p>
      {restored && (
        <p role="status" className="mt-4 rounded-xl bg-emerald-500/10 px-4 py-3 text-sm text-emerald-600 dark:text-emerald-400">
          {t.restored}
        </p>
      )}

      <div className="mt-6 rounded-2xl border border-accent/30 bg-accent-soft/40 px-5 py-4 text-sm">
        <span className="font-semibold text-ink">{t.current}</span>
        <span className="ml-3 text-ink-3">{f(t.savedAt, { date: formatDate(tutorial.updatedAt) })} · {plural(currentLength, t.chars)}</span>
      </div>

      {revisions.length === 0 ? (
        <p className="mt-6 rounded-2xl border border-dashed border-line py-12 text-center text-sm text-ink-3">
          {t.empty}
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
                    <span className="font-medium text-ink">{f(t.savedAt, { date: formatDate(revision.savedAt) })}</span>
                    <span className="text-ink-3">
                      {plural(size, t.chars)}
                      {diff === 0 ? t.compareSame : diff > 0 ? plural(diff, t.compareMore) : plural(-diff, t.compareLess)}
                    </span>
                    {revision.title !== tutorial.title && <span className="text-ink-3">{f(t.oldTitle, { title: revision.title })}</span>}
                    {revision.replacedBy && <span className="text-ink-3">{f(t.replacedBy, { name: revision.replacedBy })}</span>}
                  </summary>
                  <div className="border-t border-line px-5 py-4">
                    <div className="mb-4 flex justify-end">
                      <RestoreButton revisionId={revision.id} label={t.restore} confirmText={t.restoreConfirm} />
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
