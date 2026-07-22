import { cache } from "react";
import { prisma } from "@/lib/prisma";

/** Lightweight category list shared by the public header and footer. */
export const getPublicCategories = cache(async () =>
  prisma.category.findMany({
    orderBy: { order: "asc" },
    select: { id: true, name: true, slug: true },
  })
);

/** Homepage category cards with the published tutorial count. */
export const getHomeCategories = cache(async () =>
  prisma.category.findMany({
    orderBy: { order: "asc" },
    select: {
      id: true,
      name: true,
      slug: true,
      description: true,
      icon: true,
      color: true,
      order: true,
      _count: { select: { tutorials: { where: { published: true } } } },
    },
  })
);