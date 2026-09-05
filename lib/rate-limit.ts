/**
 * 进程内滑动窗口限流（单实例部署足够；多实例需换共享存储）。
 * 用于登录等易被暴力尝试的入口。
 */
const buckets = new Map<string, { count: number; resetAt: number }>();

const MAX_ENTRIES = 1000;

export function rateLimit(
  key: string,
  max: number,
  windowMs: number
): { ok: boolean; retryAfterSeconds: number } {
  const now = Date.now();

  // 顺带清理过期项，防止 Map 无限增长
  if (buckets.size > MAX_ENTRIES) {
    for (const [k, v] of buckets) {
      if (v.resetAt <= now) buckets.delete(k);
    }
  }

  const bucket = buckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { ok: true, retryAfterSeconds: 0 };
  }

  bucket.count += 1;
  if (bucket.count > max) {
    return {
      ok: false,
      retryAfterSeconds: Math.ceil((bucket.resetAt - now) / 1000),
    };
  }
  return { ok: true, retryAfterSeconds: 0 };
}

export function resetRateLimit(key: string) {
  buckets.delete(key);
}
