import type { Metadata } from "next";
import Link from "next/link";
import { requireAdminPage } from "@/lib/admin-auth";
import { prisma } from "@/lib/prisma";
import { tagPath } from "@/lib/tags";
import { DeleteTagButton, RenameTagForm } from "./tag-row-actions";
import { getAdminI18n } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const { m } = await getAdminI18n();
  return { title: m.admin.tags.metaTitle };
}
export const dynamic = "force-dynamic";

export default async function AdminTagsPage({ searchParams }: { searchParams: Promise<{ merged?: string }> }) {
  await requireAdminPage("taxonomy");
  const { m, f } = await getAdminI18n();
  const t = m.admin.tags;
  const { merged } = await searchParams;
  const [tags, published] = await Promise.all([
    prisma.tag.findMany({
      select: { id: true, name: true, slug: true, _count: { select: { tutorials: true } } },
      orderBy: [{ tutorials: { _count: "desc" } }, { name: "asc" }],
    }),
    prisma.tutorialTag.groupBy({
      by: ["tagId"],
      where: { tutorial: { published: true } },
      _count: { tutorialId: true },
    }),
  ]);
  const publishedCount = new Map(published.map((row) => [row.tagId, row._count.tutorialId]));

  return (
    <div className="max-w-4xl">
      <h1 className="text-2xl font-bold text-ink">{t.heading}</h1>
      <p className="mt-1 text-sm text-ink-3">{t.intro}</p>
      {merged && (
        <p role="status" className="mt-4 rounded-xl bg-emerald-500/10 px-4 py-3 text-sm text-emerald-600 dark:text-emerald-400">
          {f(t.merged, { name: merged })}
        </p>
      )}

      {tags.length === 0 ? (
        <div className="mt-8 rounded-3xl border border-dashed border-line bg-surface/60 py-16 text-center text-sm text-ink-3">
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
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {tags.map((tag) => {
                const live = publishedCount.get(tag.id) ?? 0;
                return (
                  <tr key={tag.id}>
                    <td className="px-4 py-3">
                      <RenameTagForm id={tag.id} name={tag.name} />
                    </td>
                    <td className="px-4 py-3 text-ink-2">
                      {live} / {tag._count.tutorials}
                    </td>
                    <td className="px-4 py-3">
                      {live > 0 ? (
                        <Link
                          href={tagPath(tag.slug)}
                          prefetch={false}
                          target="_blank"
                          className="text-xs text-accent-ink hover:underline"
                        >
                          /tags/{tag.slug}
                        </Link>
                      ) : (
                        <span className="text-xs text-ink-3">{t.unused}</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <DeleteTagButton id={tag.id} name={tag.name} />
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
