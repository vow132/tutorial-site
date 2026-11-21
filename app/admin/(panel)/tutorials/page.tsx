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

export const metadata: Metadata = { title: "教程管理" };

export const dynamic = "force-dynamic";

const PAGE_SIZE = 20;

const STATUSES = {
  published: { label: "已发布", where: { published: true } },
  draft: { label: "草稿", where: { published: false, publishAt: null } },
  scheduled: { label: "定时发布", where: { published: false, publishAt: { not: null } } },
} satisfies Record<string, { label: string; where: Prisma.TutorialWhereInput }>;

type Status = keyof typeof STATUSES;

const fieldCls =
  "h-10 rounded-xl border border-line bg-surface px-3 text-sm outline-none transition-colors focus:border-accent";

export default async function AdminTutorialsPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; saved?: string; q?: string; status?: string; category?: string }>;
}) {
  await requireAdminPage();
  const { page: rawPage, saved, q: rawQuery, status: rawStatus, category: rawCategory } = await searchParams;
  const query = (rawQuery ?? "").trim().slice(0, 100);
  const status = rawStatus && rawStatus in STATUSES ? (rawStatus as Status) : null;
  const categoryId = Number(rawCategory) || null;
  const where: Prisma.TutorialWhereInput = {
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
    filtered ? prisma.tutorial.count() : null,
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
    },
  });

  return (
    <div>
      {saved && /^(new|\d+)$/.test(saved) && <ClearDraft draftKey={saved} />}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-ink">教程管理</h1>
          <p className="mt-1 text-sm text-ink-3">
            {filtered ? `筛选出 ${total} 篇（共 ${all} 篇）` : `共 ${total} 篇`}
          </p>
        </div>
        <Link
          href="/admin/tutorials/new"
          className="flex h-10 items-center gap-2 rounded-full bg-btn px-5 text-sm font-semibold text-white transition-opacity hover:opacity-90"
        >
          <svg width="13" height="13" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
            <path d="M7 1v12M1 7h12" />
          </svg>
          写教程
        </Link>
      </div>

      <form role="search" aria-label="筛选教程" className="mt-6 flex flex-wrap items-center gap-2">
        <input
          type="search"
          name="q"
          defaultValue={query}
          placeholder="搜索标题或 Slug"
          aria-label="搜索标题或 Slug"
          className={`${fieldCls} min-w-0 flex-1 sm:max-w-xs`}
        />
        <select name="status" defaultValue={status ?? ""} aria-label="按状态筛选" className={fieldCls}>
          <option value="">全部状态</option>
          {Object.entries(STATUSES).map(([value, item]) => (
            <option key={value} value={value}>
              {item.label}
            </option>
          ))}
        </select>
        <select name="category" defaultValue={categoryId ?? ""} aria-label="按分类筛选" className={`${fieldCls} max-w-[12rem]`}>
          <option value="">全部分类</option>
          {categories.map(({ node, depth }) => (
            <option key={node.id} value={node.id}>
              {"　".repeat(depth)}
              {node.name}
            </option>
          ))}
        </select>
        <button type="submit" className="h-10 rounded-full border border-line px-4 text-sm font-medium text-ink-2 transition-colors hover:bg-paper hover:text-ink">
          筛选
        </button>
        {filtered && (
          <Link href="/admin/tutorials" className="px-2 text-sm text-ink-3 hover:text-ink">
            清除筛选
          </Link>
        )}
      </form>

      <div className="mt-4 overflow-hidden rounded-3xl border border-line bg-surface">
        {tutorials.length === 0 ? (
          <p className="py-20 text-center text-sm text-ink-3">
            {filtered ? "没有符合条件的教程" : "还没有教程，点击右上角开始创作"}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] text-sm">
            <thead>
              <tr className="border-b border-line text-left text-xs text-ink-3">
                <th className="w-[40%] px-6 py-3.5 font-medium">标题</th>
                <th className="hidden px-4 py-3.5 font-medium md:table-cell">分类</th>
                <th className="hidden px-4 py-3.5 font-medium sm:table-cell">阅读</th>
                <th className="hidden px-4 py-3.5 font-medium lg:table-cell">读者反馈</th>
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
                    <span className="block truncate text-xs text-ink-3">/{t.slug}</span>
                  </td>
                  <td className="hidden whitespace-nowrap px-4 py-4 md:table-cell">
                    <span
                      className="cat-text inline-flex items-center gap-1.5 text-xs"
                      style={categoryTextStyle(t.category.color)}
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
                  <td className="hidden whitespace-nowrap px-4 py-4 text-xs text-ink-2 lg:table-cell">
                    {helpfulSummary(t.helpfulYes, t.helpfulNo).text}
                  </td>
                  <td className="whitespace-nowrap px-4 py-4">
                    <form action={togglePublish}>
                      <input type="hidden" name="id" value={t.id} />
                      <button
                        type="submit"
                        title={t.publishAt ? "定时发布中，点击立即发布" : "点击切换状态"}
                        className={`rounded-full px-2.5 py-1 text-xs font-medium transition-opacity hover:opacity-70 ${
                          t.published
                            ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                            : t.publishAt
                              ? "bg-sky-500/10 text-sky-700 dark:text-sky-300"
                              : "bg-amber-500/10 text-amber-600 dark:text-amber-400"
                        }`}
                      >
                        {t.published
                          ? "已发布"
                          : t.publishAt
                            ? `定时 ${t.publishAt.toLocaleString("zh-CN", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Shanghai" })}`
                            : "草稿"}
                      </button>
                    </form>
                  </td>
                  <td className="whitespace-nowrap px-6 py-4 text-right">
                    <div className="flex items-center justify-end gap-2">
                      {/* 后台预览：草稿和定时发布的也能看；新标签页打开，不预取。 */}
                      <Link
                        href={`/admin/preview/${t.id}`}
                        target="_blank"
                        prefetch={false}
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
          </div>
        )}
      </div>
      <Pagination
        page={page}
        totalPages={totalPages}
        basePath="/admin/tutorials"
        query={filterQuery}
      />
    </div>
  );
}
