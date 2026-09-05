import type { MetadataRoute } from "next";
import { prisma } from "@/lib/prisma";
import { SITE_URL } from "@/lib/site-url";

export const dynamic = "force-dynamic";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = SITE_URL.replace(/\/$/, "");

  const [tutorials, categories] = await Promise.all([
    prisma.tutorial.findMany({
      where: { published: true },
      orderBy: { updatedAt: "desc" },
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
