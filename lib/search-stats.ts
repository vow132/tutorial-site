import { prisma } from "@/lib/prisma";
import { RateLimiter } from "@/lib/rate-limit";
import { recentDays, siteDay } from "@/lib/site-day";
import { NON_HUMAN_AGENT } from "@/lib/view-counter";
import { normalizeSearchQuery } from "@/lib/search-query";
import { isDemoMode } from "@/lib/demo";

/**
 * 搜索词统计：读者搜了什么、哪些词没搜到结果（= 现成的选题清单）。
 * 和阅读计数一样先在内存里攒几秒再批量写库；统计数据不重要，写失败就丢掉这一批。
 */

const FLUSH_DELAY_MS = 5_000;
const MAX_PENDING = 200;
const RETENTION_DAYS = 400;

type Pending = { count: number; results: number };
type SearchStatsState = { pending: Map<string, Pending>; timer: ReturnType<typeof setTimeout> | null; prunedDay?: string };

const globalForSearchStats = globalThis as typeof globalThis & { __searchStats?: SearchStatsState };
const state: SearchStatsState = (globalForSearchStats.__searchStats ??= { pending: new Map(), timer: null });

/** 同一 IP 30 分钟内重复搜同一个词（刷新、翻页回来）只算一次（需要 TRUST_PROXY 才拿得到 IP）。 */
const recent = new RateLimiter(1, 30 * 60 * 1000, 20_000);

async function flush() {
  state.timer = null;
  if (state.pending.size === 0) return;
  const batch = state.pending;
  state.pending = new Map();
  const day = siteDay();
  try {
    await prisma.$transaction(
      [...batch].map(
        ([query, item]) => prisma.$executeRaw`
          INSERT INTO "SearchQueryDaily" ("day", "query", "count", "results")
          VALUES (${day}, ${query}, ${item.count}, ${item.results})
          ON CONFLICT ("day", "query") DO UPDATE SET "count" = "count" + excluded."count", "results" = excluded."results"
        `,
      ),
    );
    if (state.prunedDay !== day) {
      state.prunedDay = day;
      const [oldest] = recentDays(RETENTION_DAYS);
      await prisma.$executeRaw`DELETE FROM "SearchQueryDaily" WHERE "day" < ${oldest}`.catch(() => undefined);
    }
  } catch (error) {
    console.warn("[search-stats] 写入失败，丢弃这一批：", error instanceof Error ? error.message : error);
  }
}

/** 记一次搜索（只记真人：爬虫、脚本的 UA 不算）。results 是这次搜到的篇数。 */
export function recordSearch(rawQuery: string, results: number, visitor: { ip: string | null; userAgent: string | null }) {
  // 演示站不记：后台对所有访客开放，搜索词会原样显示给别人看
  if (isDemoMode()) return;
  if (!visitor.userAgent || NON_HUMAN_AGENT.test(visitor.userAgent)) return;
  const query = normalizeSearchQuery(rawQuery);
  if (!query) return;
  if (visitor.ip) {
    const key = `${visitor.ip}\u0000${query}`;
    if (recent.retryAfter(key) > 0) return;
    recent.hit(key);
  }
  const item = state.pending.get(query);
  state.pending.set(query, { count: (item?.count ?? 0) + 1, results });
  if (state.pending.size >= MAX_PENDING) {
    if (state.timer) clearTimeout(state.timer);
    void flush();
    return;
  }
  if (!state.timer) {
    state.timer = setTimeout(() => void flush(), FLUSH_DELAY_MS);
    state.timer.unref?.();
  }
}

export type SearchStat = { query: string; count: number; results: number };

/** 最近 n 天搜得最多的词（结果数取最近一天的）；zeroOnly 时只要最近一次没搜到结果的。 */
export async function getSearchStats(days = 30, limit = 15, zeroOnly = false): Promise<SearchStat[]> {
  const [from] = recentDays(days);
  const rows = await prisma.$queryRaw<Array<{ query: string; total: number | bigint; results: number | bigint }>>`
    WITH recent AS (
      SELECT "query", SUM("count") AS "total", MAX("day") AS "lastDay"
      FROM "SearchQueryDaily" WHERE "day" >= ${from}
      GROUP BY "query"
    )
    SELECT r."query", r."total", s."results"
    FROM recent AS r
    JOIN "SearchQueryDaily" AS s ON s."query" = r."query" AND s."day" = r."lastDay"
    WHERE ${zeroOnly ? 1 : 0} = 0 OR s."results" = 0
    ORDER BY r."total" DESC, r."query" ASC
    LIMIT ${limit}
  `;
  return rows.map((row) => ({ query: row.query, count: Number(row.total), results: Number(row.results) }));
}
