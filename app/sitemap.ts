import type { MetadataRoute } from "next";
import { prisma } from "@/lib/prisma";
import { absoluteUrl } from "@/lib/site-url";
import { MIN_INDEXABLE_TAG_TUTORIALS, tagPath } from "@/lib/tags";
import { ABOUT_KEY, hasAboutContent, parseAbout } from "@/lib/about";

// 每小时重新生成一次，爬虫频繁抓取也不会每次都查库。
export const revalidate = 3600;

/** 单个 sitemap 最多 5 万条 URL（协议上限），留出静态页和分类的余量。 */
const MAX_TUTORIAL_URLS = 45000;

/**
 * 只列可收录的规范地址：搜索页是 noindex，不放进来（否则 Search Console 会报
 * “已提交的网址带有 noindex 标记”）。lastModified 只取教程内容的修改时间——
 * 阅读量计数不会改动 updatedAt（见 lib/view-counter.ts），所以它是可信的。
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [tutorials, categories, latestByCategory, tagCounts, aboutRow] = await Promise.all([
    prisma.tutorial.findMany({
      where: { published: true },
      orderBy: { updatedAt: "desc" },
      take: MAX_TUTORIAL_URLS,
      select: { slug: true, updatedAt: true },
    }),
    prisma.category.findMany({ select: { id: true, slug: true } }),
    prisma.tutorial.groupBy({
      by: ["categoryId"],
      where: { published: true },
      _max: { updatedAt: true },
    }),
    prisma.tutorialTag.groupBy({
      by: ["tagId"],
      where: { tutorial: { published: true } },
      _count: { tutorialId: true },
    }),
    prisma.setting.findUnique({ where: { key: ABOUT_KEY } }),
  ]);
  const about = parseAbout(aboutRow?.value);
  // 标签页：只放够收录门槛的（只有一篇教程的标签页是 noindex）。
  const indexableTagIds = tagCounts
    .filter((row) => row._count.tutorialId >= MIN_INDEXABLE_TAG_TUTORIALS)
    .map((row) => row.tagId);
  const tags = indexableTagIds.length
    ? await prisma.tag.findMany({ where: { id: { in: indexableTagIds } }, select: { slug: true } })
    : [];

  const latest = tutorials[0]?.updatedAt;
  const categoryUpdated = new Map(
    latestByCategory.map((row) => [row.categoryId, row._max.updatedAt]),
  );

  const staticPages: MetadataRoute.Sitemap = [
    { url: absoluteUrl("/"), lastModified: latest, changeFrequency: "daily", priority: 1 },
    {
      url: absoluteUrl("/tutorials"),
      lastModified: latest,
      changeFrequency: "daily",
      priority: 0.9,
    },
  ];

  return [
    ...staticPages,
    ...categories.map((c) => ({
      url: absoluteUrl(`/categories/${encodeURIComponent(c.slug)}`),
      lastModified: categoryUpdated.get(c.id) ?? undefined,
      changeFrequency: "weekly" as const,
      priority: 0.7,
    })),
    ...(hasAboutContent(about)
      ? [{
          url: absoluteUrl("/about"),
          lastModified: about.updatedAt ? new Date(about.updatedAt) : undefined,
          changeFrequency: "monthly" as const,
          priority: 0.4,
        }]
      : []),
    ...(tags.length
      ? [{ url: absoluteUrl("/tags"), changeFrequency: "weekly" as const, priority: 0.5 }]
      : []),
    ...tags.map((tag) => ({
      url: absoluteUrl(tagPath(tag.slug)),
      changeFrequency: "weekly" as const,
      priority: 0.5,
    })),
    ...tutorials.map((t) => ({
      url: absoluteUrl(`/tutorials/${encodeURIComponent(t.slug)}`),
      lastModified: t.updatedAt,
      changeFrequency: "weekly" as const,
      priority: 0.8,
    })),
  ];
}
