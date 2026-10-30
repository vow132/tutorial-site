import { cache } from "react";
import { unstable_cache } from "next/cache";
import { prisma } from "@/lib/prisma";
import { buildCategoryTree } from "@/lib/categories";

/**
 * 前台数据缓存标签：后台修改内容后用 revalidateTag(tag, { expire: 0 }) 立即失效。
 * 阅读量这类不会触发失效的数据，列表上最多滞后 LIST_REVALIDATE_SECONDS。
 */
export const CACHE_TAGS = {
  tutorials: "public-tutorials",
  categories: "public-categories",
  settings: "site-settings",
} as const;

const LIST_REVALIDATE_SECONDS = 300;

/** Lightweight category list shared by the public header and footer. */
const cachedPublicCategories = unstable_cache(
  async () =>
    prisma.category.findMany({
      orderBy: [{ order: "asc" }, { id: "asc" }],
      select: {
        id: true,
        name: true,
        slug: true,
        linkUrl: true,
        parentId: true,
        order: true,
      },
    }),
  ["public-categories"],
  { tags: [CACHE_TAGS.categories] },
);

export const getPublicCategories = cache(() => cachedPublicCategories());

export const getPublicCategoryTree = cache(async () =>
  buildCategoryTree(await getPublicCategories())
);

/** Homepage category cards with the published tutorial count. */
export const getHomeCategories = cache(async () => {
  const categories = await prisma.category.findMany({
    orderBy: [{ order: "asc" }, { id: "asc" }],
    select: {
      id: true,
      name: true,
      slug: true,
      linkUrl: true,
      parentId: true,
      description: true,
      icon: true,
      color: true,
      order: true,
      _count: { select: { tutorials: { where: { published: true } } } },
    },
  });

  return buildCategoryTree(categories);
});

/** 分类页用：全部分类及各自已发布教程数。 */
const cachedCategoriesWithCounts = unstable_cache(
  async () =>
    prisma.category.findMany({
      orderBy: [{ order: "asc" }, { id: "asc" }],
      select: {
        id: true,
        name: true,
        slug: true,
        description: true,
        icon: true,
        color: true,
        order: true,
        linkUrl: true,
        parentId: true,
        _count: {
          select: { tutorials: { where: { published: true } } },
        },
      },
    }),
  ["public-categories-with-counts"],
  {
    tags: [CACHE_TAGS.categories, CACHE_TAGS.tutorials],
    revalidate: LIST_REVALIDATE_SECONDS,
  },
);

export const getCategoriesWithCounts = cache(() => cachedCategoriesWithCounts());

const cachedTutorialCount = unstable_cache(
  async (categoryId: number | null) =>
    prisma.tutorial.count({
      where: { published: true, ...(categoryId ? { categoryId } : {}) },
    }),
  ["published-tutorial-count"],
  { tags: [CACHE_TAGS.tutorials], revalidate: LIST_REVALIDATE_SECONDS },
);

const cachedTutorialPage = unstable_cache(
  async (categoryId: number | null, page: number, pageSize: number) => {
    const rows = await prisma.tutorial.findMany({
      where: { published: true, ...(categoryId ? { categoryId } : {}) },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: {
        id: true,
        title: true,
        slug: true,
        excerpt: true,
        views: true,
        createdAt: true,
        category: { select: { name: true, color: true } },
      },
    });
    // 缓存以 JSON 存储，Date 会变成字符串；统一存 ISO 字符串，读取时再还原。
    return rows.map((row) => ({ ...row, createdAt: row.createdAt.toISOString() }));
  },
  ["published-tutorial-page"],
  {
    tags: [CACHE_TAGS.tutorials, CACHE_TAGS.categories],
    revalidate: LIST_REVALIDATE_SECONDS,
  },
);

/**
 * 已发布教程分页（可按分类过滤）。先把页码收敛到合法范围再查缓存，
 * 避免 ?page=随意数字 不断生成新的缓存条目。
 */
export async function getPublishedTutorialPage({
  categoryId = null,
  page,
  pageSize,
}: {
  categoryId?: number | null;
  page: number;
  pageSize: number;
}) {
  const total = await cachedTutorialCount(categoryId);
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(Math.max(1, Math.floor(page) || 1), totalPages);
  const rows = await cachedTutorialPage(categoryId, safePage, pageSize);
  return {
    total,
    totalPages,
    page: safePage,
    tutorials: rows.map((row) => ({ ...row, createdAt: new Date(row.createdAt) })),
  };
}
