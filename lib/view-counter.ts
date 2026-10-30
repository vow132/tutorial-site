import { prisma } from "@/lib/prisma";
import { RateLimiter } from "@/lib/rate-limit";

const FLUSH_DELAY_MS = 2_000;
const MAX_PENDING_EVENTS = 32;

type ViewCounterState = {
  pending: Map<number, number>;
  pendingEvents: number;
  timer: ReturnType<typeof setTimeout> | null;
  flushing: boolean;
};

const globalForViewCounter = globalThis as typeof globalThis & {
  __tutorialViewCounter?: ViewCounterState;
};

const state =
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
    await prisma.$transaction(
      [...batch].map(([id, increment]) =>
        prisma.tutorial.updateMany({
          where: { id },
          data: { views: { increment } },
        }),
      ),
    );
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
const NON_HUMAN_AGENT =
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
