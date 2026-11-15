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
/**
 * 分类、设置只靠后台保存时按标签失效；绕过后台改库（恢复备份、手工 SQL）时
 * 缓存不会知道，所以再加一个每小时自动刷新的兜底。
 */
export const SLOW_REVALIDATE_SECONDS = 3600;

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
  { tags: [CACHE_TAGS.categories], revalidate: SLOW_REVALIDATE_SECONDS },
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

/** 文章页底部“相关教程”最多展示几篇。 */
export const RELATED_TUTORIAL_LIMIT = 4;

const relatedTutorialSelect = {
  id: true,
  title: true,
  slug: true,
  excerpt: true,
  views: true,
  createdAt: true,
  category: { select: { name: true, color: true } },
} as const;

/**
 * 相关教程：先取同分类里阅读量高的，不够再从父分类、子分类、同级子分类补。
 * 顶级分类彼此不算相关（前端 ≠ 数据库），所以没有父分类时不取“同级”。
 * 多取两篇，让页面去掉与“上一篇/下一篇”重复的之后仍然够数。
 */
const cachedRelatedTutorials = unstable_cache(
  async (tutorialId: number, categoryId: number) => {
    const take = RELATED_TUTORIAL_LIMIT + 2;
    const orderBy = [{ views: "desc" as const }, { createdAt: "desc" as const }];
    const rows = await prisma.tutorial.findMany({
      where: { published: true, categoryId, id: { not: tutorialId } },
      orderBy,
      take,
      select: relatedTutorialSelect,
    });

    if (rows.length < take) {
      const categories = await prisma.category.findMany({
        select: { id: true, parentId: true },
      });
      const current = categories.find((item) => item.id === categoryId);
      const nearby = categories
        .filter(
          (item) =>
            item.id !== categoryId &&
            (item.id === current?.parentId ||
              item.parentId === categoryId ||
              (current?.parentId != null && item.parentId === current.parentId)),
        )
        .map((item) => item.id);
      if (nearby.length > 0) {
        rows.push(
          ...(await prisma.tutorial.findMany({
            where: { published: true, categoryId: { in: nearby }, id: { not: tutorialId } },
            orderBy,
            take: take - rows.length,
            select: relatedTutorialSelect,
          })),
        );
      }
    }

    return rows.map((row) => ({ ...row, createdAt: row.createdAt.toISOString() }));
  },
  ["related-tutorials"],
  {
    tags: [CACHE_TAGS.tutorials, CACHE_TAGS.categories],
    revalidate: LIST_REVALIDATE_SECONDS,
  },
);

/**
 * 返回最多 RELATED_TUTORIAL_LIMIT + 2 篇候选；页面去掉“上一篇/下一篇”后再截取，
 * 这样查询可以和上一篇/下一篇并行。
 */
export async function getRelatedTutorialCandidates(tutorialId: number, categoryId: number) {
  const rows = await cachedRelatedTutorials(tutorialId, categoryId);
  return rows.map((row) => ({ ...row, createdAt: new Date(row.createdAt) }));
}
