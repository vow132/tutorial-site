/*
 * Cloudflare Turnstile 人机验证：纯函数部分（配置的存储格式、令牌校验结果的判断、调用 siteverify）。
 * 读写数据库在 lib/turnstile-store.ts；浏览器端组件是 components/turnstile-widget.tsx。
 * 这个文件不引用 Next 和 Prisma：scripts/reset-admin.ts（Docker 里打包成 .mjs）也用它关闭人机验证。
 *
 * 流程：页面上的小组件让读者过一下验证，拿到一次性令牌（5 分钟内有效）随表单提交；
 * 服务端带上 Secret Key 去 Cloudflare 的 siteverify 接口核对，核对成功才继续处理。
 */

export const TURNSTILE_SETTING_KEY = "turnstile";
/** secret-box 的 purpose：Secret Key 单独加密，换主密钥时由 lib/secret-migration.ts 重新加密 */
export const TURNSTILE_SECRET_PURPOSE = "turnstile";
export const TURNSTILE_ORIGIN = "https://challenges.cloudflare.com";
/** 显式渲染：脚本加载后由组件自己调用 turnstile.render() */
export const TURNSTILE_SCRIPT_URL = `${TURNSTILE_ORIGIN}/turnstile/v0/api.js?render=explicit`;
const SITEVERIFY_URL = `${TURNSTILE_ORIGIN}/turnstile/v0/siteverify`;

/** 用到人机验证的地方。也是传给小组件的 action，Cloudflare 原样带回，服务端核对，令牌不能挪作他用。 */
export const TURNSTILE_ACTIONS = ["login", "subscribe", "feedback", "settings"] as const;
export type TurnstileAction = (typeof TURNSTILE_ACTIONS)[number];

/** Cloudflare 的令牌最长 2048 个字符 */
export const MAX_TOKEN_LENGTH = 2048;
const KEY_PATTERN = /^[0-9A-Za-z_-]{10,128}$/;

/** 存在 Setting 表里的样子：开关和 Site Key 是明文（公开的），Secret Key 是 secret-box 密文。 */
export type StoredTurnstile = { enabled: boolean; siteKey: string; secret: string };

export const emptyTurnstile: StoredTurnstile = { enabled: false, siteKey: "", secret: "" };

export function isTurnstileKey(value: string) {
  return KEY_PATTERN.test(value);
}

export function readStoredTurnstile(raw: string | null | undefined): StoredTurnstile {
  if (!raw) return emptyTurnstile;
  try {
    const value = JSON.parse(raw) as Partial<StoredTurnstile>;
    const siteKey = typeof value.siteKey === "string" && isTurnstileKey(value.siteKey) ? value.siteKey : "";
    const secret = typeof value.secret === "string" ? value.secret : "";
    return { enabled: value.enabled === true && Boolean(siteKey && secret), siteKey, secret };
  } catch {
    return emptyTurnstile;
  }
}

export function serializeStoredTurnstile(value: StoredTurnstile) {
  return JSON.stringify({ enabled: value.enabled, siteKey: value.siteKey, secret: value.secret });
}

/** 应急关闭（npm run admin:reset）：只改开关，密钥留着，下次在后台重新打开即可。没开启时返回 null。 */
export function disabledStoredTurnstile(raw: string | null | undefined): string | null {
  const current = readStoredTurnstile(raw);
  if (!current.enabled) return null;
  return serializeStoredTurnstile({ ...current, enabled: false });
}

/** 后台显示用：0x4AAAAAAA…Wxyz */
export function maskKey(key: string) {
  return key.length > 12 ? `${key.slice(0, 8)}…${key.slice(-4)}` : key;
}

/** 表单里拿到的令牌：不是字符串、空的、超长的都当作没有。 */
export function readToken(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const token = value.trim();
  return token && token.length <= MAX_TOKEN_LENGTH ? token : null;
}

/**
 * siteverify 地址。环境变量 TURNSTILE_VERIFY_URL 只给端到端测试用（指向本机的假服务器），
 * 只接受本机回环地址：配错了也不会把 Secret Key 发到别人的服务器上。
 */
export function siteverifyUrl(env: Record<string, string | undefined> = process.env) {
  const override = env.TURNSTILE_VERIFY_URL;
  if (!override) return SITEVERIFY_URL;
  try {
    const url = new URL(override);
    if (url.protocol === "http:" && (url.hostname === "127.0.0.1" || url.hostname === "localhost")) return url.toString();
  } catch {
    // 落到下面
  }
  console.warn("[turnstile] TURNSTILE_VERIFY_URL 只能指向本机（测试用），已忽略");
  return SITEVERIFY_URL;
}

export type SiteverifyResult = {
  success?: unknown;
  hostname?: unknown;
  action?: unknown;
  "error-codes"?: unknown;
};

export type Verdict = { ok: true } | { ok: false; reason: string };

/**
 * 判断 siteverify 的返回：成功、action 对得上（令牌不能从别的表单挪过来），
 * 给了期望的域名时域名也要对得上（同一个 Site Key 可能还配了别的域名，比如测试站）。
 */
export function judgeSiteverify(result: SiteverifyResult, expected: { action: TurnstileAction; hostname: string | null }): Verdict {
  if (result.success !== true) {
    const codes = Array.isArray(result["error-codes"]) ? result["error-codes"].filter((code) => typeof code === "string") : [];
    return { ok: false, reason: codes.length > 0 ? codes.join(", ") : "verification failed" };
  }
  if (result.action !== expected.action) return { ok: false, reason: `action mismatch: ${String(result.action)}` };
  if (expected.hostname && String(result.hostname ?? "").toLowerCase() !== expected.hostname.toLowerCase()) {
    return { ok: false, reason: `hostname mismatch: ${String(result.hostname)}` };
  }
  return { ok: true };
}

export type VerifyOptions = {
  secret: string;
  token: string;
  action: TurnstileAction;
  /** 期望的域名（取自 SITE_URL）；null 表示不核对（开发环境，Cloudflare 的测试密钥返回 example.com） */
  hostname: string | null;
  ip?: string | null;
  fetchImpl?: typeof fetch;
  url?: string;
  timeoutMs?: number;
};

/** 带 Secret Key 去 Cloudflare 核对令牌。连不上、超时、返回格式不对都算失败（宁可拦下，不放过）。 */
export async function verifyTurnstileToken(options: VerifyOptions): Promise<Verdict> {
  const body = new URLSearchParams({ secret: options.secret, response: options.token, idempotency_key: crypto.randomUUID() });
  if (options.ip) body.set("remoteip", options.ip);
  try {
    const response = await (options.fetchImpl ?? fetch)(options.url ?? siteverifyUrl(), {
      method: "POST",
      body,
      signal: AbortSignal.timeout(options.timeoutMs ?? 8000),
      cache: "no-store",
    });
    if (!response.ok) return { ok: false, reason: `siteverify HTTP ${response.status}` };
    const result = (await response.json()) as SiteverifyResult;
    return judgeSiteverify(result ?? {}, { action: options.action, hostname: options.hostname });
  } catch (error) {
    return { ok: false, reason: error instanceof Error ? error.message : String(error) };
  }
}
