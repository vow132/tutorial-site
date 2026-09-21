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
      views: true,
      categoryId: true,
      createdAt: true,
      category: true,
    },
  }),
);
