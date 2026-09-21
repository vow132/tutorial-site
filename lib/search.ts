import { prisma } from "@/lib/prisma";

export type TutorialSearchResult = {
  id: number;
  title: string;
  slug: string;
  excerpt: string | null;
  content: string;
  views: number;
  category: {
    name: string;
    color: string;
  };
};

type RawSearchResult = Omit<TutorialSearchResult, "id" | "views" | "category"> & {
  id: number | bigint;
  views: number | bigint;
  categoryName: string;
  categoryColor: string;
};

const SEARCH_LIMIT = 20;

function canUseTrigramSearch(query: string) {
  const searchableCharacters = query.replace(/[\p{P}\p{S}\s]/gu, "");
  return Array.from(searchableCharacters).length >= 3;
}

async function fallbackSearch(query: string): Promise<TutorialSearchResult[]> {
  return prisma.tutorial.findMany({
    where: {
      published: true,
      OR: [
        { title: { contains: query } },
        { excerpt: { contains: query } },
        { content: { contains: query } },
      ],
    },
    orderBy: { views: "desc" },
    take: SEARCH_LIMIT,
    select: {
      id: true,
      title: true,
      slug: true,
      excerpt: true,
      content: true,
      views: true,
      category: { select: { name: true, color: true } },
    },
  });
}

export async function searchPublishedTutorials(
  rawQuery: string
): Promise<TutorialSearchResult[]> {
  const query = rawQuery.trim().slice(0, 100);
  if (!query) return [];

  // FTS5's trigram tokenizer needs at least three searchable characters.
  if (!canUseTrigramSearch(query)) return fallbackSearch(query);

  // A quoted MATCH expression keeps punctuation and spaces literal. Doubling a
  // quote is FTS5's string escape syntax; the value is still SQL-parameterized.
  const matchQuery = `"${query.replace(/"/g, '""')}"`;

  try {
    const rows = await prisma.$queryRaw<RawSearchResult[]>`
      SELECT
        t."id",
        t."title",
        t."slug",
        t."excerpt",
        t."content",
        t."views",
        c."name" AS "categoryName",
        c."color" AS "categoryColor"
      FROM "TutorialSearch"
      JOIN "Tutorial" AS t ON t."id" = "TutorialSearch"."rowid"
      JOIN "Category" AS c ON c."id" = t."categoryId"
      WHERE "TutorialSearch" MATCH ${matchQuery}
        AND t."published" = 1
      ORDER BY bm25("TutorialSearch", 10.0, 3.0, 1.0), t."views" DESC
      LIMIT ${SEARCH_LIMIT}
    `;

    return rows.map((row) => ({
      id: Number(row.id),
      title: row.title,
      slug: row.slug,
      excerpt: row.excerpt,
      content: row.content,
      views: Number(row.views),
      category: {
        name: row.categoryName,
        color: row.categoryColor,
      },
    }));
  } catch (error) {
    // Keep search available during rolling deploys before the migration lands,
    // or on SQLite builds without FTS5 support.
    console.warn("FTS search unavailable; using substring search instead.", error);
    return fallbackSearch(query);
  }
}
