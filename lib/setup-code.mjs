/**
 * 首次安装（/admin/setup）用的安装码（纯 JS：网站、种子脚本、scripts/setup-code.mjs 共用）。
 *
 * 新站还没有任何后台账号时，谁先打开安装页谁就能当站长——互联网上有专门扫描刚部署好的网站抢装的程序。
 * 所以安装页要输入安装码：由 AUTH_SECRET 推导（HMAC），只出现在服务器的启动日志里（或运行 npm run setup:code），
 * 不用另外存储，也不会随数据库泄露；装好以后安装页关闭，安装码也就没用了。
 */
import { createHmac, timingSafeEqual } from "node:crypto";
import { authSecretFrom } from "./auth-secret.mjs";

/** 去掉了容易看错的 0/O、1/I/L。 */
const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
const LENGTH = 8;

/** 文档、.env.example 里出现过的管理员密码占位值：照抄等于没设置，按「没设置」处理（走安装页）。 */
export const PLACEHOLDER_ADMIN_PASSWORDS = Object.freeze(["请修改为强密码"]);

/** @param {unknown} value */
export function isUsableAdminPassword(value) {
  return typeof value === "string" && value.trim() !== "" && !PLACEHOLDER_ADMIN_PASSWORDS.includes(value.trim());
}

/**
 * 当前的安装码（XXXX-XXXX）；生产环境 AUTH_SECRET 没设置或是占位值时返回 null（这时不能安装，先改 .env）。
 * @param {Record<string, string | undefined>} [env]
 * @returns {string | null}
 */
export function setupCodeFrom(env = process.env) {
  const secret = authSecretFrom(env);
  if (!secret) return null;
  const digest = createHmac("sha256", secret).update("tutorial-site:setup:v1").digest();
  let code = "";
  for (let i = 0; i < LENGTH; i++) code += ALPHABET[digest[i] % ALPHABET.length];
  return `${code.slice(0, 4)}-${code.slice(4)}`;
}

/** 用户输入的安装码：忽略大小写、空格和连字符。 */
export function normalizeSetupCode(/** @type {unknown} */ input) {
  return typeof input === "string" ? input.toUpperCase().replace(/[^A-Z0-9]/g, "") : "";
}

/**
 * @param {unknown} input
 * @param {Record<string, string | undefined>} [env]
 */
export function setupCodeMatches(input, env = process.env) {
  const expected = setupCodeFrom(env);
  if (!expected) return false;
  const a = Buffer.from(normalizeSetupCode(input));
  const b = Buffer.from(normalizeSetupCode(expected));
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * 启动日志 / 种子脚本里打印的安装提示。
 * @param {string} siteUrl
 * @param {Record<string, string | undefined>} [env]
 */
export function setupHint(siteUrl, env = process.env) {
  const code = setupCodeFrom(env);
  if (!code) {
    return "⚠️ 还没有后台账号，但 AUTH_SECRET 没有设置（或还是占位值），不能安装：先在 .env 里改好 AUTH_SECRET 再重启。";
  }
  const url = `${siteUrl.replace(/\/$/, "")}/admin/setup`;
  return `🔑 还没有后台账号：打开 ${url} 设置站名和站长账号，安装码 ${code}（只在这里显示；忘了可以运行 npm run setup:code）`;
}
