import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { stripHtml } from "@/lib/article";
import { htmlFragmentToText, snippetAround, snippetShowsKeyword } from "@/lib/search-snippet";
import { sharedLimiter } from "@/lib/rate-limit";
import { bigramMatchQuery } from "@/lib/search-index";
import { tagSlug } from "@/lib/tags";

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

/** 两个字的中文词（及单字、两个字母的单词）在正文里查：走 TutorialBigram（lib/search-index.ts）。 */
async function bigramSearch(match: string): Promise<TutorialSearchResult[]> {
  try {
    const rows = await prisma.$queryRaw<RawSearchResult[]>`
      SELECT
        t."id", t."title", t."slug", t."excerpt",
        substr(t."content", 1, ${CONTENT_HEAD}) AS "contentHead",
        t."views",
        c."name" AS "categoryName",
        c."color" AS "categoryColor"
      FROM "TutorialBigram"
      JOIN "Tutorial" AS t ON t."id" = "TutorialBigram"."rowid"
      JOIN "Category" AS c ON c."id" = t."categoryId"
      WHERE "TutorialBigram" MATCH ${match}
        AND t."published" = 1
      ORDER BY bm25("TutorialBigram"), t."views" DESC
      LIMIT ${SEARCH_LIMIT}
    `;
    return rows.map(toResult);
  } catch {
    // 索引表还没建好（迁移未执行）时只用标题结果
    return [];
  }
}

/** 标签名和查询完全一样（不分大小写，或别名相同）的教程排在最前面。 */
async function tagSearch(query: string): Promise<TutorialSearchResult[]> {
  const slug = tagSlug(query);
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
      AND EXISTS (
        SELECT 1 FROM "TutorialTag" AS tt JOIN "Tag" AS g ON g."id" = tt."tagId"
        WHERE tt."tutorialId" = t."id" AND (lower(g."name") = lower(${query}) OR g."slug" = ${slug})
      )
    ORDER BY t."views" DESC
    LIMIT ${SEARCH_LIMIT}
  `;
  return rows.map(toResult);
}

/** 合并多路结果：按顺序去重，最多 SEARCH_LIMIT 条。 */
function mergeResults(...lists: TutorialSearchResult[][]) {
  const seen = new Set<number>();
  const merged: TutorialSearchResult[] = [];
  for (const item of lists.flat()) {
    if (seen.has(item.id)) continue;
    seen.add(item.id);
    merged.push(item);
  }
  return merged.slice(0, SEARCH_LIMIT);
}

/** 短查询：标题/摘要命中优先，再补正文里的两字词命中。 */
async function shortSearch(query: string): Promise<TutorialSearchResult[]> {
  const match = bigramMatchQuery(query);
  const [byTitle, byBody] = await Promise.all([titleSearch(query), match ? bigramSearch(match) : []]);
  return mergeResults(byTitle, byBody);
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

/** 正文里关键词前后各取多少字符的 HTML 来做摘要（HTML 里有标签，取得比显示的宽一些）。 */
const NEAR_LEAD = 300;
const NEAR_WINDOW = 900;

/**
 * 摘要里看不到关键词的结果（关键词在正文中间），换成关键词前后的一段正文。
 * 只对最终的 ≤20 条结果各查一次 instr，不在大结果集上做全文扫描。
 */
async function refineSnippets(results: TutorialSearchResult[], query: string) {
  const ids = results.filter((item) => !snippetShowsKeyword(item.snippet, query)).map((item) => item.id);
  if (ids.length === 0) return results;
  try {
    const rows = await prisma.$queryRaw<Array<{ id: number | bigint; near: string; startsAt: number | bigint; total: number | bigint }>>`
      SELECT "id",
        substr("content", max(1, "pos" - ${NEAR_LEAD}), ${NEAR_WINDOW}) AS "near",
        max(1, "pos" - ${NEAR_LEAD}) AS "startsAt",
        length("content") AS "total"
      FROM (
        SELECT "id", "content", instr(lower("content"), lower(${query})) AS "pos"
        FROM "Tutorial" WHERE "id" IN (${Prisma.join(ids)})
      )
      WHERE "pos" > 0
    `;
    const near = new Map(
      rows.map((row) => {
        const startsAt = Number(row.startsAt);
        const text = htmlFragmentToText(row.near);
        const snippet = snippetAround(text, query, {
          openStart: startsAt > 1,
          openEnd: startsAt - 1 + NEAR_WINDOW < Number(row.total),
        });
        return [Number(row.id), snippet] as const;
      }),
    );
    // 关键词被标签拆开（如 <strong>缓</strong>存）或只出现在属性里时找不到，保留原摘要
    return results.map((item) => ({ ...item, snippet: near.get(item.id) ?? item.snippet }));
  } catch {
    return results;
  }
}

/** 发布、撤回、删除教程或改分类后清空，避免搜到已下线的文章。 */
export function clearSearchCache() {
  cache.clear();
}

/**
 * 全站搜索预算：每 5 秒最多执行 20 次「未命中缓存」的数据库查询（平均每分钟 240 次）。
 * 按访客 IP 的限流要配置 TRUST_PROXY 才生效；这一层不依赖 IP，防止有人不停换
 * 关键词让同步执行的 SQLite 查询占满进程。窗口取 5 秒，突发流量也只会占用一小段时间。
 */
const GLOBAL_SEARCH_BUDGET = { max: 20, windowMs: 5_000 };

/** 全站搜索预算用完时抛出，搜索页提示稍后再试。 */
export class SearchBusyError extends Error {
  constructor(readonly retryAfterSeconds: number) {
    super("search budget exhausted");
  }
}

/** 相同关键词 60 秒内复用结果（并发请求也共享同一次查询）；命中缓存不消耗全站预算。 */
export function searchPublishedTutorials(
  rawQuery: string
): Promise<TutorialSearchResult[]> {
  const query = rawQuery.trim().slice(0, 100);
  if (!query) return Promise.resolve([]);

  const key = query.toLowerCase();
  const now = Date.now();
  const hit = cache.get(key);
  if (hit && hit.expires > now) return hit.promise;

  const budget = sharedLimiter("search:global", GLOBAL_SEARCH_BUDGET.max, GLOBAL_SEARCH_BUDGET.windowMs);
  const wait = budget.retryAfter("all", now);
  if (wait > 0) return Promise.reject(new SearchBusyError(wait));
  budget.hit("all", now);

  const promise = Promise.all([tagSearch(query), isShortQuery(query) ? shortSearch(query) : fullTextSearch(query)])
    .then(([byTag, rest]) => refineSnippets(mergeResults(byTag, rest), query))
    .catch(
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
