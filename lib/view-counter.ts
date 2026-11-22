import { prisma } from "@/lib/prisma";
import { RateLimiter } from "@/lib/rate-limit";
import { recentDays, siteDay } from "@/lib/site-day";

const FLUSH_DELAY_MS = 2_000;
const MAX_PENDING_EVENTS = 32;
/** 每日阅读明细保留约一年多，更早的每天第一次写入时顺手删掉。 */
const DAILY_VIEW_RETENTION_DAYS = 400;

type Counts = { views: number; completions: number };

type ViewCounterState = {
  /** 每篇教程这一批的阅读数和读完数 */
  pending: Map<number, Counts>;
  /** 这一批阅读的来源（见 lib/referrer.ts） */
  sources: Map<string, number>;
  pendingEvents: number;
  timer: ReturnType<typeof setTimeout> | null;
  flushing: boolean;
  /** 今天是否已经清理过过期的每日明细 */
  prunedDay?: string;
};

const globalForViewCounter = globalThis as typeof globalThis & {
  __tutorialViewCounterV2?: ViewCounterState;
};

const state: ViewCounterState = (globalForViewCounter.__tutorialViewCounterV2 ??= {
  pending: new Map(),
  sources: new Map(),
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

function add(id: number, counts: Partial<Counts>) {
  const current = state.pending.get(id) ?? { views: 0, completions: 0 };
  current.views += counts.views ?? 0;
  current.completions += counts.completions ?? 0;
  state.pending.set(id, current);
}

async function flushTutorialViews() {
  if (state.flushing || state.pendingEvents === 0) return;

  state.flushing = true;
  const batch = state.pending;
  const sources = state.sources;
  state.pending = new Map();
  state.sources = new Map();
  state.pendingEvents = 0;

  try {
    const day = siteDay();
    // 用原生 SQL：Prisma 的 update/updateMany 会顺带刷新 @updatedAt，
    // 每次阅读都会让 sitemap lastmod、文章 modified_time 变成“刚刚修改”。
    // 每日明细用 INSERT … SELECT：教程刚被删掉时插不进去也不报错（否则这批会一直重试）。
    await prisma.$transaction([
      ...[...batch].flatMap(([id, counts]) => [
        ...(counts.views > 0
          ? [prisma.$executeRaw`UPDATE "Tutorial" SET "views" = "views" + ${counts.views} WHERE "id" = ${id}`]
          : []),
        prisma.$executeRaw`
          INSERT INTO "TutorialDailyView" ("tutorialId", "day", "views", "completions")
          SELECT "id", ${day}, ${counts.views}, ${counts.completions} FROM "Tutorial" WHERE "id" = ${id}
          ON CONFLICT ("tutorialId", "day") DO UPDATE SET
            "views" = "views" + excluded."views",
            "completions" = "completions" + excluded."completions"
        `,
      ]),
      ...[...sources].map(
        ([source, views]) => prisma.$executeRaw`
          INSERT INTO "ReferrerDaily" ("day", "source", "views") VALUES (${day}, ${source}, ${views})
          ON CONFLICT ("day", "source") DO UPDATE SET "views" = "views" + excluded."views"
        `,
      ),
    ]);
    if (state.prunedDay !== day) {
      state.prunedDay = day;
      const [oldest] = recentDays(DAILY_VIEW_RETENTION_DAYS);
      // 单独处理失败：上面这批已经写进去了，不能因为清理失败再重新计一遍
      await prisma
        .$transaction([
          prisma.$executeRaw`DELETE FROM "TutorialDailyView" WHERE "day" < ${oldest}`,
          prisma.$executeRaw`DELETE FROM "ReferrerDaily" WHERE "day" < ${oldest}`,
        ])
        .catch(() => undefined);
    }
  } catch {
    for (const [id, counts] of batch) {
      add(id, counts);
      state.pendingEvents += counts.views + counts.completions;
    }
    for (const [source, views] of sources) state.sources.set(source, (state.sources.get(source) ?? 0) + views);
  } finally {
    state.flushing = false;
    scheduleFlush();
  }
}

function queueEvent() {
  state.pendingEvents += 1;
  if (state.pendingEvents >= MAX_PENDING_EVENTS && !state.flushing) {
    if (state.timer) clearTimeout(state.timer);
    state.timer = null;
    void flushTutorialViews();
    return;
  }
  scheduleFlush();
}

/**
 * Coalesce hot-page counters into short SQLite transactions. A crash can lose
 * at most the current two-second batch, which is acceptable for this counter.
 */
export function queueTutorialView(id: number, source?: string) {
  add(id, { views: 1 });
  if (source) state.sources.set(source, (state.sources.get(source) ?? 0) + 1);
  queueEvent();
}

/** 爬虫、监控和脚本的 UA；它们的访问不计入阅读量。 */
export const NON_HUMAN_AGENT =
  /bot|crawl|spider|slurp|preview|monitor|fetch|curl|wget|python|java\/|go-http|httpclient|okhttp|axios|headless|lighthouse/i;

/** 同一 IP 30 分钟内重复打开同一篇只算一次（需要 TRUST_PROXY 才能拿到 IP）。 */
const recentViews = new RateLimiter(1, 30 * 60 * 1000, 50_000);
/** 读完同理：同一 IP 每篇一天只算一次。 */
const recentReads = new RateLimiter(1, 24 * 60 * 60 * 1000, 50_000);

type Visitor = { ip: string | null; userAgent: string | null };

const isHuman = (visitor: Visitor) => Boolean(visitor.userAgent) && !NON_HUMAN_AGENT.test(visitor.userAgent!);

function firstTime(limiter: RateLimiter, key: string, ip: string | null) {
  if (!ip) return true;
  const full = `${key}:${ip}`;
  if (limiter.retryAfter(full) > 0) return false;
  limiter.hit(full);
  return true;
}

/** 记一次阅读；source 是规整后的来源（lib/referrer.ts），同一次阅读只记一个来源。 */
export function countTutorialView(id: number, visitor: Visitor, source?: string) {
  if (!isHuman(visitor) || !firstTime(recentViews, String(id), visitor.ip)) return;
  queueTutorialView(id, source);
}

/** 记一次读完（读到正文末尾并停留一段时间，由浏览器判断后上报）。 */
export function countTutorialRead(id: number, visitor: Visitor) {
  if (!isHuman(visitor) || !firstTime(recentReads, String(id), visitor.ip)) return;
  add(id, { completions: 1 });
  queueEvent();
}
