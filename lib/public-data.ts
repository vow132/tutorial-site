import { cache } from "react";
import { prisma } from "@/lib/prisma";
import { buildCategoryTree } from "@/lib/categories";

/** Lightweight category list shared by the public header and footer. */
export const getPublicCategories = cache(async () =>
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
  })
);

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
