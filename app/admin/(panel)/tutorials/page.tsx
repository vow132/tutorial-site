import type { Metadata } from "next";
import { requireAdminPage } from "@/lib/admin-auth";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { deleteTutorial, togglePublish } from "@/lib/actions/tutorials";
import Pagination from "@/components/pagination";
import DeleteButton from "./delete-button";
import ClearDraft from "./clear-draft";
import { categoryTextStyle } from "@/lib/color";
import { buildCategoryTree, flattenCategoryTree } from "@/lib/categories";
import { helpfulSummary } from "@/lib/feedback";
import type { Prisma } from "@/generated/prisma/client";
import { can } from "@/lib/roles";
import { getAdminI18n } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const { m } = await getAdminI18n();
  return { title: m.admin.tutorials.metaTitle };
}

export const dynamic = "force-dynamic";

const PAGE_SIZE = 20;

const STATUSES = {
  published: { label: "statusPublished", where: { published: true } },
  draft: { label: "statusDraft", where: { published: false, publishAt: null } },
  scheduled: { label: "statusScheduled", where: { published: false, publishAt: { not: null } } },
} satisfies Record<string, { label: "statusPublished" | "statusDraft" | "statusScheduled"; where: Prisma.TutorialWhereInput }>;

type Status = keyof typeof STATUSES;

const fieldCls =
  "h-10 rounded-xl border border-line bg-surface px-3 text-sm outline-none transition-colors focus:border-accent";

export default async function AdminTutorialsPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; saved?: string; q?: string; status?: string; category?: string; forbidden?: string }>;
}) {
  const admin = await requireAdminPage("tutorials");
  const i18n = await getAdminI18n();
  const { m, f, plural, num, date } = i18n;
  const t = m.admin.tutorials;
  const { page: rawPage, saved, q: rawQuery, status: rawStatus, category: rawCategory, forbidden } = await searchParams;
  // 作者只看得到、改得了自己的教程；编辑和站长看全部，并显示每篇的作者
  const seesAll = can(admin.role, "tutorials.others");
  const mine: Prisma.TutorialWhereInput = seesAll ? {} : { authorId: admin.id };
  const query = (rawQuery ?? "").trim().slice(0, 100);
  const status = rawStatus && rawStatus in STATUSES ? (rawStatus as Status) : null;
  const categoryId = Number(rawCategory) || null;
  const where: Prisma.TutorialWhereInput = {
    ...mine,
    ...(query ? { OR: [{ title: { contains: query } }, { slug: { contains: query } }] } : {}),
    ...(status ? STATUSES[status].where : {}),
    ...(categoryId ? { categoryId } : {}),
  };
  const filtered = Boolean(query || status || categoryId);
  // 分页链接带上当前筛选条件
  const filterQuery: Record<string, string> = {
    ...(query ? { q: query } : {}),
    ...(status ? { status } : {}),
    ...(categoryId ? { category: String(categoryId) } : {}),
  };

  const requestedPage = Number.parseInt(rawPage ?? "1", 10);
  const [total, all, categoryRows] = await Promise.all([
    prisma.tutorial.count({ where }),
    filtered ? prisma.tutorial.count({ where: mine }) : null,
    prisma.category.findMany({
      orderBy: [{ order: "asc" }, { id: "asc" }],
      select: { id: true, name: true, parentId: true, order: true },
    }),
  ]);
  const categories = flattenCategoryTree(buildCategoryTree(categoryRows));
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const page = Number.isFinite(requestedPage)
    ? Math.min(Math.max(requestedPage, 1), totalPages)
    : 1;

  const tutorials = await prisma.tutorial.findMany({
    where,
    orderBy: { updatedAt: "desc" },
    skip: (page - 1) * PAGE_SIZE,
    take: PAGE_SIZE,
    select: {
      id: true,
      title: true,
      slug: true,
      views: true,
      published: true,
      publishAt: true,
      helpfulYes: true,
      helpfulNo: true,
      category: { select: { name: true, color: true } },
      author: { select: { username: true, displayName: true } },
    },
  });
  const showAuthors = seesAll && (await prisma.admin.count()) > 1;

  return (
    <div>
      {saved && /^(new|\d+)$/.test(saved) && <ClearDraft draftKey={saved} />}
      {forbidden && (
        <p role="alert" className="mb-4 rounded-2xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-700 dark:text-amber-300">
          {t.authorOnly}
        </p>
      )}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-ink">{t.heading}</h1>
          <p className="mt-1 text-sm text-ink-3">
            {filtered ? plural(total, t.countFiltered, { all: num(all ?? 0) }) : plural(total, t.count)}
          </p>
        </div>
        <div className="flex items-center gap-2">
        {can(admin.role, "import") && (
          <Link
            href="/admin/tutorials/import"
            className="flex h-10 items-center rounded-full border border-line px-4 text-sm text-ink-2 transition-colors hover:bg-paper hover:text-ink"
          >
            {t.bulkImport}
          </Link>
        )}
        <Link
          href="/admin/tutorials/new"
          className="flex h-10 items-center gap-2 rounded-full bg-btn px-5 text-sm font-semibold text-white transition-opacity hover:opacity-90"
        >
          <svg width="13" height="13" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
            <path d="M7 1v12M1 7h12" />
          </svg>
          {t.newTutorial}
        </Link>
        </div>
      </div>

      <form role="search" aria-label={t.filterLabel} className="mt-6 flex flex-wrap items-center gap-2">
        <input
          type="search"
          name="q"
          defaultValue={query}
          placeholder={t.searchPlaceholder}
          aria-label={t.searchPlaceholder}
          className={`${fieldCls} min-w-0 flex-1 sm:max-w-xs`}
        />
        <select name="status" defaultValue={status ?? ""} aria-label={t.statusFilter} className={fieldCls}>
          <option value="">{t.allStatuses}</option>
          {Object.entries(STATUSES).map(([value, item]) => (
            <option key={value} value={value}>
              {t[item.label]}
            </option>
          ))}
        </select>
        <select name="category" defaultValue={categoryId ?? ""} aria-label={t.categoryFilter} className={`${fieldCls} max-w-[12rem]`}>
          <option value="">{t.allCategories}</option>
          {categories.map(({ node, depth }) => (
            <option key={node.id} value={node.id}>
              {"　".repeat(depth)}
              {node.name}
            </option>
          ))}
        </select>
        <button type="submit" className="h-10 rounded-full border border-line px-4 text-sm font-medium text-ink-2 transition-colors hover:bg-paper hover:text-ink">
          {t.filter}
        </button>
        {filtered && (
          <Link href="/admin/tutorials" className="px-2 text-sm text-ink-3 hover:text-ink">
            {t.clearFilter}
          </Link>
        )}
      </form>

      <div className="mt-4 overflow-hidden rounded-3xl border border-line bg-surface">
        {tutorials.length === 0 ? (
          <p className="py-20 text-center text-sm text-ink-3">
            {filtered ? t.emptyFiltered : t.empty}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] text-sm">
            <thead>
              <tr className="border-b border-line text-left text-xs text-ink-3">
                <th className="w-[40%] px-6 py-3.5 font-medium">{t.colTitle}</th>
                <th className="hidden px-4 py-3.5 font-medium md:table-cell">{t.colCategory}</th>
                <th className="hidden px-4 py-3.5 font-medium sm:table-cell">{t.colViews}</th>
                <th className="hidden px-4 py-3.5 font-medium lg:table-cell">{t.colFeedback}</th>
                <th className="px-4 py-3.5 font-medium">{t.colStatus}</th>
                <th className="px-6 py-3.5 text-right font-medium">{t.colActions}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {tutorials.map((item) => (
                <tr key={item.id} className="transition-colors hover:bg-paper/60">
                  <td className="max-w-0 px-6 py-4">
                    <Link
                      href={`/admin/tutorials/${item.id}`}
                      className="block truncate font-semibold text-ink hover:text-accent"
                    >
                      {item.title}
                    </Link>
                    <span className="block truncate text-xs text-ink-3">
                      /{item.slug}
                      {showAuthors && item.author && ` · ${item.author.displayName || item.author.username}`}
                    </span>
                  </td>
                  <td className="hidden whitespace-nowrap px-4 py-4 md:table-cell">
                    <span
                      className="cat-text inline-flex items-center gap-1.5 text-xs"
                      style={categoryTextStyle(item.category.color)}
                    >
                      <span
                        className="h-1.5 w-1.5 rounded-full"
                        style={{ backgroundColor: item.category.color }}
                      />
                      {item.category.name}
                    </span>
                  </td>
                  <td className="hidden whitespace-nowrap px-4 py-4 text-ink-2 sm:table-cell">
                    {num(item.views)}
                  </td>
                  <td className="hidden whitespace-nowrap px-4 py-4 text-xs text-ink-2 lg:table-cell">
                    {helpfulSummary(item.helpfulYes, item.helpfulNo, i18n).text}
                  </td>
                  <td className="whitespace-nowrap px-4 py-4">
                    <form action={togglePublish}>
                      <input type="hidden" name="id" value={item.id} />
                      <button
                        type="submit"
                        title={item.publishAt ? t.toggleScheduled : t.toggle}
                        className={`rounded-full px-2.5 py-1 text-xs font-medium transition-opacity hover:opacity-70 ${
                          item.published
                            ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                            : item.publishAt
                              ? "bg-sky-500/10 text-sky-700 dark:text-sky-300"
                              : "bg-amber-500/10 text-amber-600 dark:text-amber-400"
                        }`}
                      >
                        {item.published
                          ? t.statusPublished
                          : item.publishAt
                            ? f(t.scheduledAt, { time: date(item.publishAt, { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" }) })
                            : t.statusDraft}
                      </button>
                    </form>
                  </td>
                  <td className="whitespace-nowrap px-6 py-4 text-right">
                    <div className="flex items-center justify-end gap-2">
                      {/* 后台预览：草稿和定时发布的也能看；新标签页打开，不预取。 */}
                      <Link
                        href={`/admin/preview/${item.id}`}
                        target="_blank"
                        prefetch={false}
                        className="rounded-lg px-2.5 py-1.5 text-xs text-ink-3 transition-colors hover:bg-paper hover:text-ink"
                      >
                        {m.admin.common.preview}
                      </Link>
                      <Link
                        href={`/admin/tutorials/${item.id}`}
                        className="rounded-lg px-2.5 py-1.5 text-xs font-medium text-accent transition-colors hover:bg-accent-soft"
                      >
                        {m.admin.common.edit}
                      </Link>
                      <DeleteButton id={item.id} action={deleteTutorial} label={m.admin.common.delete} confirmText={t.deleteConfirm} />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        )}
      </div>
      <Pagination
        page={page}
        totalPages={totalPages}
        basePath="/admin/tutorials"
        query={filterQuery}
        labels={m.site.pagination}
      />
    </div>
  );
}
