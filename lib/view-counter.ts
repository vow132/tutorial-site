import { prisma } from "@/lib/prisma";
import { RateLimiter } from "@/lib/rate-limit";
import { recentDays, siteDay } from "@/lib/site-day";

const FLUSH_DELAY_MS = 2_000;
const MAX_PENDING_EVENTS = 32;
/** 每日阅读明细保留约一年多，更早的每天第一次写入时顺手删掉。 */
const DAILY_VIEW_RETENTION_DAYS = 400;

type ViewCounterState = {
  pending: Map<number, number>;
  pendingEvents: number;
  timer: ReturnType<typeof setTimeout> | null;
  flushing: boolean;
  /** 今天是否已经清理过过期的每日明细 */
  prunedDay?: string;
};

const globalForViewCounter = globalThis as typeof globalThis & {
  __tutorialViewCounter?: ViewCounterState;
};

const state: ViewCounterState =
  globalForViewCounter.__tutorialViewCounter ??
  (globalForViewCounter.__tutorialViewCounter = {
    pending: new Map(),
    pendingEvents: 0,
    timer: null,
    flushing: false,
  });

function scheduleFlush() {
  if (state.timer || state.flushing || state.pendingEvents === 0) return;

  state.timer = setTimeout(() => {
    state.timer = null;
    void flushTutorialViews();
  }, FLUSH_DELAY_MS);
  state.timer.unref?.();
}

async function flushTutorialViews() {
  if (state.flushing || state.pendingEvents === 0) return;

  state.flushing = true;
  const batch = state.pending;
  state.pending = new Map();
  state.pendingEvents = 0;

  try {
    const day = siteDay();
    // 用原生 SQL：Prisma 的 update/updateMany 会顺带刷新 @updatedAt，
    // 每次阅读都会让 sitemap lastmod、文章 modified_time 变成“刚刚修改”。
    // 每日明细用 INSERT … SELECT：教程刚被删掉时插不进去也不报错（否则这批会一直重试）。
    await prisma.$transaction(
      [...batch].flatMap(([id, increment]) => [
        prisma.$executeRaw`UPDATE "Tutorial" SET "views" = "views" + ${increment} WHERE "id" = ${id}`,
        prisma.$executeRaw`
          INSERT INTO "TutorialDailyView" ("tutorialId", "day", "views")
          SELECT "id", ${day}, ${increment} FROM "Tutorial" WHERE "id" = ${id}
          ON CONFLICT ("tutorialId", "day") DO UPDATE SET "views" = "views" + excluded."views"
        `,
      ]),
    );
    if (state.prunedDay !== day) {
      state.prunedDay = day;
      const [oldest] = recentDays(DAILY_VIEW_RETENTION_DAYS);
      // 单独处理失败：上面这批已经写进去了，不能因为清理失败再重新计一遍
      await prisma.$executeRaw`DELETE FROM "TutorialDailyView" WHERE "day" < ${oldest}`.catch(() => undefined);
    }
  } catch {
    for (const [id, increment] of batch) {
      state.pending.set(id, (state.pending.get(id) ?? 0) + increment);
      state.pendingEvents += increment;
    }
  } finally {
    state.flushing = false;
    scheduleFlush();
  }
}

/**
 * Coalesce hot-page counters into short SQLite transactions. A crash can lose
 * at most the current two-second batch, which is acceptable for this counter.
 */
export function queueTutorialView(id: number) {
  state.pending.set(id, (state.pending.get(id) ?? 0) + 1);
  state.pendingEvents += 1;

  if (state.pendingEvents >= MAX_PENDING_EVENTS && !state.flushing) {
    if (state.timer) clearTimeout(state.timer);
    state.timer = null;
    void flushTutorialViews();
    return;
  }

  scheduleFlush();
}

/** 爬虫、监控和脚本的 UA；它们的访问不计入阅读量。 */
export const NON_HUMAN_AGENT =
  /bot|crawl|spider|slurp|preview|monitor|fetch|curl|wget|python|java\/|go-http|httpclient|okhttp|axios|headless|lighthouse/i;

/** 同一 IP 30 分钟内重复打开同一篇只算一次（需要 TRUST_PROXY 才能拿到 IP）。 */
const recentViews = new RateLimiter(1, 30 * 60 * 1000, 50_000);

export function countTutorialView(
  id: number,
  visitor: { ip: string | null; userAgent: string | null },
) {
  if (!visitor.userAgent || NON_HUMAN_AGENT.test(visitor.userAgent)) return;
  if (visitor.ip) {
    const key = `${id}:${visitor.ip}`;
    if (recentViews.retryAfter(key) > 0) return;
    recentViews.hit(key);
  }
  queueTutorialView(id);
}
