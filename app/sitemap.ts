import type { MetadataRoute } from "next";
import { prisma } from "@/lib/prisma";
import { SITE_URL } from "@/lib/site-url";

// 每小时重新生成一次，爬虫频繁抓取也不会每次都查库。
export const revalidate = 3600;

/** 单个 sitemap 最多 5 万条 URL（协议上限），留出静态页和分类的余量。 */
const MAX_TUTORIAL_URLS = 45000;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = SITE_URL.replace(/\/$/, "");

  const [tutorials, categories] = await Promise.all([
    prisma.tutorial.findMany({
      where: { published: true },
      orderBy: { updatedAt: "desc" },
      take: MAX_TUTORIAL_URLS,
      select: { slug: true, updatedAt: true },
    }),
    prisma.category.findMany({
      select: { slug: true },
    }),
  ]);

  const staticPages: MetadataRoute.Sitemap = [
    { url: `${base}/`, changeFrequency: "daily", priority: 1 },
    {
      url: `${base}/tutorials`,
      changeFrequency: "daily",
      priority: 0.9,
    },
    { url: `${base}/search`, changeFrequency: "weekly", priority: 0.3 },
  ];

  return [
    ...staticPages,
    ...categories.map((c) => ({
      url: `${base}/categories/${encodeURIComponent(c.slug)}`,
      changeFrequency: "weekly" as const,
      priority: 0.7,
    })),
    ...tutorials.map((t) => ({
      url: `${base}/tutorials/${encodeURIComponent(t.slug)}`,
      lastModified: t.updatedAt,
      changeFrequency: "weekly" as const,
      priority: 0.8,
    })),
  ];
}
