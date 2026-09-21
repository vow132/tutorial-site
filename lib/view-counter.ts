import { prisma } from "@/lib/prisma";

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
