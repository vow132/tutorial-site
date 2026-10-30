import { prisma } from "@/lib/prisma";
import { stripHtml } from "@/lib/article";

export type TutorialSearchResult = {
  id: number;
  title: string;
  slug: string;
  /** 纯文本摘要（约 140 字），不再把整篇正文搬出数据库。 */
  snippet: string;
  views: number;
  category: {
    name: string;
    color: string;
  };
};

type RawSearchResult = {
  id: number | bigint;
  title: string;
  slug: string;
  excerpt: string | null;
  contentHead: string;
  views: number | bigint;
  categoryName: string;
  categoryColor: string;
};

const SEARCH_LIMIT = 20;
/** 摘要只需要正文开头一段，SQL 里截断，避免搬运几十 KB 的长文。 */
const CONTENT_HEAD = 1500;
const CACHE_TTL_MS = 60_000;
const CACHE_CAPACITY = 500;

const cache = new Map<string, { expires: number; promise: Promise<TutorialSearchResult[]> }>();

/** FTS5 trigram 分词至少需要 3 个可搜索字符。 */
export function isShortQuery(query: string) {
  const searchableCharacters = query.replace(/[\p{P}\p{S}\s]/gu, "");
  return Array.from(searchableCharacters).length < 3;
}

function toResult(row: RawSearchResult): TutorialSearchResult {
  return {
    id: Number(row.id),
    title: row.title,
    slug: row.slug,
    // 截断处可能落在标签中间，先去掉末尾未闭合的半个标签。
    snippet: row.excerpt || stripHtml(row.contentHead.replace(/<[^>]*$/, ""), 140),
    views: Number(row.views),
    category: { name: row.categoryName, color: row.categoryColor },
  };
}

/**
 * 1–2 个字的查询无法走索引。对正文做 LIKE 全表扫描在文章多了以后会阻塞
 * SQLite（better-sqlite3 是同步的，会卡住整个进程），所以只匹配标题和摘要。
 */
async function titleSearch(query: string): Promise<TutorialSearchResult[]> {
  const rows = await prisma.$queryRaw<RawSearchResult[]>`
    SELECT
      t."id", t."title", t."slug", t."excerpt",
      substr(t."content", 1, ${CONTENT_HEAD}) AS "contentHead",
      t."views",
      c."name" AS "categoryName",
      c."color" AS "categoryColor"
    FROM "Tutorial" AS t
    JOIN "Category" AS c ON c."id" = t."categoryId"
    WHERE t."published" = 1
      AND (instr(lower(t."title"), lower(${query})) > 0
        OR instr(lower(COALESCE(t."excerpt", '')), lower(${query})) > 0)
    ORDER BY t."views" DESC
    LIMIT ${SEARCH_LIMIT}
  `;
  return rows.map(toResult);
}

async function fullTextSearch(query: string): Promise<TutorialSearchResult[]> {
  // A quoted MATCH expression keeps punctuation and spaces literal. Doubling a
  // quote is FTS5's string escape syntax; the value is still SQL-parameterized.
  const matchQuery = `"${query.replace(/"/g, '""')}"`;

  try {
    const rows = await prisma.$queryRaw<RawSearchResult[]>`
      SELECT
        t."id", t."title", t."slug", t."excerpt",
        substr(t."content", 1, ${CONTENT_HEAD}) AS "contentHead",
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
    return rows.map(toResult);
  } catch (error) {
    // Keep search available during rolling deploys before the migration lands,
    // or on SQLite builds without FTS5 support.
    console.warn("FTS search unavailable; using title search instead.", error);
    return titleSearch(query);
  }
}

/** 相同关键词 60 秒内复用结果（并发请求也共享同一次查询）。 */
export function searchPublishedTutorials(
  rawQuery: string
): Promise<TutorialSearchResult[]> {
  const query = rawQuery.trim().slice(0, 100);
  if (!query) return Promise.resolve([]);

  const key = query.toLowerCase();
  const now = Date.now();
  const hit = cache.get(key);
  if (hit && hit.expires > now) return hit.promise;

  const promise = (isShortQuery(query) ? titleSearch(query) : fullTextSearch(query)).catch(
    (error) => {
      cache.delete(key);
      throw error;
    },
  );
  cache.delete(key);
  cache.set(key, { expires: now + CACHE_TTL_MS, promise });
  if (cache.size > CACHE_CAPACITY) {
    const oldest = cache.keys().next().value;
    if (oldest !== undefined) cache.delete(oldest);
  }
  return promise;
}
