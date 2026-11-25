import { cache } from "react";
import { prisma } from "@/lib/prisma";

/** Reuse the article query across metadata and the page render. */
export const getPublishedTutorial = cache(async (slug: string) =>
  prisma.tutorial.findFirst({
    where: { slug, published: true },
    select: {
      id: true,
      title: true,
      slug: true,
      excerpt: true,
      content: true,
      cover: true,
      views: true,
      categoryId: true,
      seriesId: true,
      // 文章页署名：只取后台填的署名，不取登录用户名
      author: { select: { displayName: true } },
      createdAt: true,
      updatedAt: true,
      category: true,
      tags: { orderBy: { position: "asc" }, select: { tag: { select: { name: true, slug: true } } } },
    },
  }),
);
