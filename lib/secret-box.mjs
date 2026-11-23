/**
 * 数据库里敏感字段的静态加密（AES-256-GCM）：两步验证密钥、告警推送的 Webhook/Token 等。
 * 目的：数据库文件或备份单独泄露时，这些密钥仍然是密文。密钥来自环境变量，不在数据库里。
 *
 * - 加密密钥：设置了 DATA_ENCRYPTION_KEY 就用它，否则由 AUTH_SECRET 派生（零配置）。
 *   两者都在用时，旧的 AUTH_SECRET 派生密钥只用来解密，网站启动时会把旧数据重新加密。
 * - 格式：enc:v1:<密钥编号>:<iv>:<tag>:<密文>（base64url）。不带前缀的旧明文照常读取。
 * - purpose 作为附加认证数据，防止把一个字段的密文挪到另一个字段里使用。
 *
 * 纯 JS（.mjs）是为了让网站和独立脚本（scripts/backup.mjs 等）共用同一份实现。
 */
import { createCipheriv, createDecipheriv, createHash, hkdfSync, randomBytes } from "node:crypto";
import { PLACEHOLDER_SECRETS, authSecretFrom } from "./auth-secret.mjs";

const PREFIX = "enc:v1:";

/**
 * @typedef {{ id: string, key: Buffer }} SecretKey
 * @typedef {Record<string, string | undefined>} Env
 */

/** @param {string} material @param {string} label */
function derive(material, label) {
  return Buffer.from(hkdfSync("sha256", material, "tutorial-site", `secret-box:${label}`, 32));
}

/** @param {Buffer} key */
function keyId(key) {
  return createHash("sha256").update(key).digest("base64url").slice(0, 8);
}

/**
 * 可用的密钥，第一个用于加密，其余只用于解密旧数据。
 * @param {Env} [env]
 * @returns {SecretKey[]}
 */
export function secretKeys(env = process.env) {
  /** @type {Buffer[]} */
  const keys = [];
  const dataKey = env.DATA_ENCRYPTION_KEY?.trim();
  if (dataKey) keys.push(derive(dataKey, "data-key"));
  const authSecret = authSecretFrom(env);
  if (authSecret) keys.push(derive(authSecret, "auth-secret"));
  return keys.map((key) => ({ id: keyId(key), key }));
}

/**
 * 由公开占位值派生的密钥：只用来解密。以前用占位值当 AUTH_SECRET 的站点换成真密钥后，
 * 启动时的重新加密（lib/secret-migration.ts）还能读出旧数据，换成新密钥加密，两步验证等不用重设。
 * @returns {SecretKey[]}
 */
function placeholderKeys() {
  return PLACEHOLDER_SECRETS.map((value) => derive(value, "auth-secret")).map((key) => ({ id: keyId(key), key }));
}

/** @param {unknown} value */
export function isSealed(value) {
  return typeof value === "string" && value.startsWith(PREFIX);
}

/**
 * 加密。
 * @param {string} plaintext
 * @param {string} purpose 用途标签，如 "totp"、"alerts"
 * @param {Env} [env]
 */
export function sealSecret(plaintext, purpose, env = process.env) {
  const [primary] = secretKeys(env);
  if (!primary) throw new Error("缺少加密密钥：请设置 AUTH_SECRET（或 DATA_ENCRYPTION_KEY）");
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", primary.key, iv);
  cipher.setAAD(Buffer.from(purpose));
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  return `${PREFIX}${primary.id}:${iv.toString("base64url")}:${cipher.getAuthTag().toString("base64url")}:${ciphertext.toString("base64url")}`;
}

export class SecretBoxError extends Error {}

/**
 * 解密；不带前缀的旧明文原样返回。密钥对不上或数据被篡改时抛出 SecretBoxError。
 * @param {string} value
 * @param {string} purpose
 * @param {Env} [env]
 */
export function openSecret(value, purpose, env = process.env) {
  if (!isSealed(value)) return value;
  const [id, iv, tag, ciphertext] = value.slice(PREFIX.length).split(":");
  const match = [...secretKeys(env), ...placeholderKeys()].find((item) => item.id === id);
  if (!match || !iv || !tag || ciphertext === undefined) {
    throw new SecretBoxError("找不到对应的加密密钥（AUTH_SECRET / DATA_ENCRYPTION_KEY 可能已更换）");
  }
  try {
    const decipher = createDecipheriv("aes-256-gcm", match.key, Buffer.from(iv, "base64url"));
    decipher.setAAD(Buffer.from(purpose));
    decipher.setAuthTag(Buffer.from(tag, "base64url"));
    return Buffer.concat([decipher.update(Buffer.from(ciphertext, "base64url")), decipher.final()]).toString("utf8");
  } catch {
    throw new SecretBoxError("密文校验失败（数据被改动或用途不符）");
  }
}

/**
 * 是否需要重新加密：旧明文，或用的不是当前主密钥。
 * @param {string} value
 * @param {Env} [env]
 */
export function needsReseal(value, env = process.env) {
  if (!isSealed(value)) return true;
  const [primary] = secretKeys(env);
  return Boolean(primary) && value.slice(PREFIX.length).split(":")[0] !== primary.id;
}
