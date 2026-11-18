import { cache } from "react";
import { unstable_cache } from "next/cache";
import type { Prisma } from "@/generated/prisma/client";
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
  tags: "public-tags",
  about: "about-page",
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
        thumbnail: true,
        views: true,
        createdAt: true,
        category: { select: { name: true, color: true } },
      },
    });
    // 缓存以 JSON 存储，Date 会变成字符串；统一存 ISO 字符串，读取时再还原。
    return rows.map((row) => ({ ...row, createdAt: row.createdAt.toISOString() }));
  },
  ["published-tutorial-page", "v2"],
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
  thumbnail: true,
  views: true,
  createdAt: true,
  category: { select: { name: true, color: true } },
} as const;

type RelatedRow = Prisma.TutorialGetPayload<{ select: typeof relatedTutorialSelect }>;

/**
 * 相关教程：先取共同标签最多的，再取同分类里阅读量高的，不够再从父分类、子分类、
 * 同级子分类补。顶级分类彼此不算相关（前端 ≠ 数据库），所以没有父分类时不取“同级”。
 * 多取两篇，让页面去掉与“上一篇/下一篇”重复的之后仍然够数。
 */
const cachedRelatedTutorials = unstable_cache(
  async (tutorialId: number, categoryId: number) => {
    const take = RELATED_TUTORIAL_LIMIT + 2;
    const orderBy = [{ views: "desc" as const }, { createdAt: "desc" as const }];
    const rows: RelatedRow[] = [];

    const tagIds = (
      await prisma.tutorialTag.findMany({ where: { tutorialId }, select: { tagId: true } })
    ).map((row) => row.tagId);
    if (tagIds.length > 0) {
      const shared = await prisma.tutorialTag.groupBy({
        by: ["tutorialId"],
        where: { tagId: { in: tagIds }, tutorialId: { not: tutorialId }, tutorial: { published: true } },
        _count: { tagId: true },
        orderBy: { _count: { tagId: "desc" } },
        take: 50,
      });
      const sharedCount = new Map(shared.map((row) => [row.tutorialId, row._count.tagId]));
      const candidates = await prisma.tutorial.findMany({
        where: { id: { in: [...sharedCount.keys()] } },
        select: relatedTutorialSelect,
      });
      candidates.sort(
        (a, b) =>
          sharedCount.get(b.id)! - sharedCount.get(a.id)! ||
          b.views - a.views ||
          b.createdAt.getTime() - a.createdAt.getTime(),
      );
      rows.push(...candidates.slice(0, take));
    }
    const exclude = () => [tutorialId, ...rows.map((row) => row.id)];

    if (rows.length < take) {
      rows.push(
        ...(await prisma.tutorial.findMany({
          where: { published: true, categoryId, id: { notIn: exclude() } },
          orderBy,
          take: take - rows.length,
          select: relatedTutorialSelect,
        })),
      );
    }

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
            where: { published: true, categoryId: { in: nearby }, id: { notIn: exclude() } },
            orderBy,
            take: take - rows.length,
            select: relatedTutorialSelect,
          })),
        );
      }
    }

    return rows.map((row) => ({ ...row, createdAt: row.createdAt.toISOString() }));
  },
  ["related-tutorials", "v3"],
  {
    tags: [CACHE_TAGS.tutorials, CACHE_TAGS.categories, CACHE_TAGS.tags],
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

export type PublishedTag = { id: number; name: string; slug: string; count: number };

/** 有已发布教程的标签及篇数，按篇数降序（标签页、热门标签、sitemap 共用）。 */
const cachedPublishedTags = unstable_cache(
  async (): Promise<PublishedTag[]> => {
    const counts = await prisma.tutorialTag.groupBy({
      by: ["tagId"],
      where: { tutorial: { published: true } },
      _count: { tutorialId: true },
    });
    const count = new Map(counts.map((row) => [row.tagId, row._count.tutorialId]));
    const tags = await prisma.tag.findMany({
      where: { id: { in: [...count.keys()] } },
      select: { id: true, name: true, slug: true },
    });
    return tags
      .map((tag) => ({ ...tag, count: count.get(tag.id) ?? 0 }))
      .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, "zh-CN"));
  },
  ["published-tags"],
  { tags: [CACHE_TAGS.tutorials, CACHE_TAGS.tags], revalidate: LIST_REVALIDATE_SECONDS },
);

export const getPublishedTags = cache(() => cachedPublishedTags());

const cachedTagTutorialPage = unstable_cache(
  async (tagId: number, page: number, pageSize: number) => {
    const rows = await prisma.tutorial.findMany({
      where: { published: true, tags: { some: { tagId } } },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: relatedTutorialSelect,
    });
    return rows.map((row) => ({ ...row, createdAt: row.createdAt.toISOString() }));
  },
  ["tag-tutorial-page"],
  { tags: [CACHE_TAGS.tutorials, CACHE_TAGS.tags], revalidate: LIST_REVALIDATE_SECONDS },
);

/** 某个标签下的已发布教程分页；页码先收敛到合法范围。 */
export async function getTagTutorialPage({ tag, page, pageSize }: { tag: PublishedTag; page: number; pageSize: number }) {
  const totalPages = Math.max(1, Math.ceil(tag.count / pageSize));
  const safePage = Math.min(Math.max(1, Math.floor(page) || 1), totalPages);
  const rows = await cachedTagTutorialPage(tag.id, safePage, pageSize);
  return {
    total: tag.count,
    totalPages,
    page: safePage,
    tutorials: rows.map((row) => ({ ...row, createdAt: new Date(row.createdAt) })),
  };
}
