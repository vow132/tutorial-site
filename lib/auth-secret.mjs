/**
 * AUTH_SECRET 的读取规则（会话签名、订阅链接、敏感字段加密共用；纯 JS，独立脚本也能引用）。
 *
 * 文档和 .env.example 里出现过的占位值，用了就等于把密钥公开：任何人都能签发后台会话。
 * 所以生产环境把它们当作「没设置」，开发环境退回固定的开发密钥。
 */

/** 开发环境没设置 AUTH_SECRET 时使用的固定值。 */
export const DEV_FALLBACK_SECRET = "dev-secret-change-me-in-production";

/** 公开出现过的占位值（.env.example、README、旧版文档）。 */
export const PLACEHOLDER_SECRETS = Object.freeze([DEV_FALLBACK_SECRET, "请替换为随机长字符串"]);

/** @param {unknown} value */
export function isPlaceholderSecret(value) {
  return typeof value === "string" && PLACEHOLDER_SECRETS.includes(value.trim());
}

/**
 * 可以使用的 AUTH_SECRET：生产环境没设置或是占位值时返回 null（调用方拒绝工作），开发环境返回固定的开发密钥。
 * @param {Record<string, string | undefined>} [env]
 * @returns {string | null}
 */
export function authSecretFrom(env = process.env) {
  const value = env.AUTH_SECRET;
  if (value && !isPlaceholderSecret(value)) return value;
  return env.NODE_ENV === "production" ? null : DEV_FALLBACK_SECRET;
}
