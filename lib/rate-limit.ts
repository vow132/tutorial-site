/**
 * 进程内固定窗口计数器（单实例部署足够；多实例需换 Redis 等共享存储）。
 *
 * - `retryAfter()` 只读检查，`hit()` 记一次；调用方决定"什么算一次"：
 *   登录只记失败（正确密码不会被自己之前的尝试锁住），搜索每次都记。
 * - Map 按插入顺序当作 LRU，超过 capacity 淘汰最旧的一条，每次操作 O(1)，
 *   不会被大量随机 key 撑爆内存或拖慢 CPU。
 */
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
    if (this.entries.size > this.capacity) {
      const oldest = this.entries.keys().next().value;
      if (oldest !== undefined) this.entries.delete(oldest);
    }
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
