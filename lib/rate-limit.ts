/**
 * 进程内固定窗口计数器。
 *
 * 本项目是单进程部署（SQLite；PM2 的 ecosystem.config.cjs 固定 1 个实例，Docker 也是一个进程），
 * 所以计数放在内存里就够了；改成多实例部署时要换成 Redis 等共享存储。进程重启会清零计数。
 *
 * - `retryAfter()` 只读检查，`hit()` 记一次；调用方决定"什么算一次"：
 *   登录只记失败（正确密码不会被自己之前的尝试锁住），搜索每次都记。
 * - Map 按插入顺序当作 LRU，超过 capacity 淘汰一条，不会被大量随机 key 撑爆内存或拖慢 CPU。
 *   淘汰时跳过正在限制中的记录（见 evict()）：攻击者换大量用户名或 IP 刷请求，挤不掉自己已经被锁住的记录。
 *   登录另有全站总量限制（lib/actions/auth.ts），刷新 key 的速度本身也受它约束。
 */
const EVICTION_SCAN = 64;

export class RateLimiter {
  private readonly entries = new Map<string, { count: number; resetAt: number }>();

  constructor(
    private readonly max: number,
    private readonly windowMs: number,
    private readonly capacity = 10_000,
  ) {}

  /** 0 表示允许；否则为需要等待的秒数。 */
  retryAfter(key: string, now = Date.now()): number {
    const entry = this.entries.get(key);
    if (!entry) return 0;
    if (entry.resetAt <= now) {
      this.entries.delete(key);
      return 0;
    }
    return entry.count >= this.max ? Math.ceil((entry.resetAt - now) / 1000) : 0;
  }

  hit(key: string, now = Date.now()) {
    const entry = this.entries.get(key);
    this.entries.delete(key);
    if (!entry || entry.resetAt <= now) {
      this.entries.set(key, { count: 1, resetAt: now + this.windowMs });
    } else {
      entry.count += 1;
      this.entries.set(key, entry);
    }
    if (this.entries.size > this.capacity) this.evict(now);
  }

  /**
   * 从最旧的开始找一条可以丢的：已过期的、或者还没到上限的（丢了最多让那个 key 少记几次）。
   * 正在限制中的记录尽量留着；最多看 EVICTION_SCAN 条，都在限制中就丢最旧的一条，保证每次操作的开销有上限。
   */
  private evict(now: number) {
    let scanned = 0;
    for (const [key, entry] of this.entries) {
      if (entry.resetAt <= now || entry.count < this.max) {
        this.entries.delete(key);
        return;
      }
      if (++scanned >= EVICTION_SCAN) break;
    }
    const oldest = this.entries.keys().next().value;
    if (oldest !== undefined) this.entries.delete(oldest);
  }

  reset(key: string) {
    this.entries.delete(key);
  }
}

const globalLimiters = globalThis as typeof globalThis & {
  __rateLimiters?: Map<string, RateLimiter>;
};

/** 按名称复用限流器，避免开发环境热重载时计数被清零。 */
export function sharedLimiter(
  name: string,
  max: number,
  windowMs: number,
  capacity?: number,
): RateLimiter {
  const limiters = (globalLimiters.__rateLimiters ??= new Map());
  let limiter = limiters.get(name);
  if (!limiter) {
    limiter = new RateLimiter(max, windowMs, capacity);
    limiters.set(name, limiter);
  }
  return limiter;
}

/**
 * 只能用一次的口令（进程内，过期自动忘掉）。`claim()` 第一次见到某个值返回 true 并记下，
 * 有效期内再来返回 false；判断和记录之间没有 await，并发请求里也只有一个能拿到。
 * 有效期固定，所以 Map 的插入顺序就是过期顺序：每次只需从头清掉已过期的，均摊 O(1)。
 * 超过 capacity 时丢最早的一条（它最先过期）。
 */
export class OneTimeSet {
  private readonly entries = new Map<string, number>();

  constructor(
    private readonly ttlMs: number,
    private readonly capacity = 10_000,
  ) {}

  claim(value: string, now = Date.now()): boolean {
    for (const [key, expiresAt] of this.entries) {
      if (expiresAt > now) break;
      this.entries.delete(key);
    }
    if (this.entries.has(value)) return false;
    this.entries.set(value, now + this.ttlMs);
    if (this.entries.size > this.capacity) {
      const oldest = this.entries.keys().next().value;
      if (oldest !== undefined) this.entries.delete(oldest);
    }
    return true;
  }
}

const globalOneTimeSets = globalThis as typeof globalThis & { __oneTimeSets?: Map<string, OneTimeSet> };

/** 按名称复用（同 sharedLimiter，开发环境热重载不丢记录）。 */
export function sharedOneTimeSet(name: string, ttlMs: number, capacity?: number): OneTimeSet {
  const sets = (globalOneTimeSets.__oneTimeSets ??= new Map());
  let set = sets.get(name);
  if (!set) {
    set = new OneTimeSet(ttlMs, capacity);
    sets.set(name, set);
  }
  return set;
}
