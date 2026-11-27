import { cache } from "react";
import { unstable_cache } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getClientIp } from "@/lib/client-ip";
import { CACHE_TAGS, SLOW_REVALIDATE_SECONDS } from "@/lib/public-data";
import { openSecret, sealSecret } from "@/lib/secret-box.mjs";
import { SITE_URL } from "@/lib/site-url";
import {
  readStoredTurnstile,
  readToken,
  serializeStoredTurnstile,
  TURNSTILE_SECRET_PURPOSE,
  TURNSTILE_SETTING_KEY,
  verifyTurnstileToken,
  type StoredTurnstile,
  type TurnstileAction,
  type Verdict,
} from "@/lib/turnstile";

/**
 * 人机验证配置的存取（Setting key=turnstile）和服务端核对。
 * - 前台页面用 getTurnstileSiteKey()（只有公开的 Site Key，按 settings 标签缓存）决定要不要显示小组件；
 * - 登录页和每次核对都直接读库（loadTurnstile()）：npm run admin:reset 在命令行关掉人机验证后立即生效，
 *   不受 Next 缓存影响。
 */

export type TurnstileConfig = {
  enabled: boolean;
  siteKey: string;
  /** 解密后的 Secret Key；没填或解不开（换了主密钥又没有旧密钥）时为空串 */
  secret: string;
  /** 存了 Secret Key 但解不开 */
  secretUnreadable: boolean;
};

export async function loadTurnstile(): Promise<TurnstileConfig> {
  const row = await prisma.setting.findUnique({ where: { key: TURNSTILE_SETTING_KEY } });
  const stored = readStoredTurnstile(row?.value);
  let secret = "";
  let secretUnreadable = false;
  if (stored.secret) {
    try {
      secret = openSecret(stored.secret, TURNSTILE_SECRET_PURPOSE);
    } catch {
      secretUnreadable = true;
    }
  }
  // Secret Key 解不开时按关闭处理：人机验证是附加的一层，不能因为它把站长锁在后台外面
  return { enabled: stored.enabled && Boolean(secret), siteKey: stored.siteKey, secret, secretUnreadable };
}

export function sealTurnstile(config: { enabled: boolean; siteKey: string; secret: string }): string {
  const stored: StoredTurnstile = {
    enabled: config.enabled,
    siteKey: config.siteKey,
    secret: config.secret ? sealSecret(config.secret, TURNSTILE_SECRET_PURPOSE) : "",
  };
  return serializeStoredTurnstile(stored);
}

export async function saveTurnstile(config: { enabled: boolean; siteKey: string; secret: string }) {
  const value = sealTurnstile(config);
  await prisma.setting.upsert({ where: { key: TURNSTILE_SETTING_KEY }, update: { value }, create: { key: TURNSTILE_SETTING_KEY, value } });
}

/** 开启时的 Site Key，没开启时为 null。直接读库，登录页用。 */
export async function currentTurnstileSiteKey(): Promise<string | null> {
  const config = await loadTurnstile();
  return config.enabled ? config.siteKey : null;
}

const cachedSiteKey = unstable_cache(currentTurnstileSiteKey, ["turnstile-site-key"], {
  // 后台保存人机验证设置时按 settings 标签失效
  tags: [CACHE_TAGS.settings],
  revalidate: SLOW_REVALIDATE_SECONDS,
});

/** 前台（ISR 缓存页）用：开启时的 Site Key，否则 null。 */
export const getTurnstileSiteKey = cache(async () => cachedSiteKey());

/** 核对时期望的域名：生产环境取 SITE_URL；开发环境不核对（Cloudflare 的测试密钥返回 example.com）。 */
function expectedHostname() {
  if (process.env.NODE_ENV !== "production") return null;
  try {
    return new URL(SITE_URL).hostname;
  } catch {
    return null;
  }
}

/** 用指定的 Secret Key 核对一个令牌（后台保存设置前的试验也用它）。 */
export async function checkTurnstileToken(secret: string, token: unknown, action: TurnstileAction): Promise<Verdict> {
  const value = readToken(token);
  if (!value) return { ok: false, reason: "missing token" };
  return verifyTurnstileToken({ secret, token: value, action, hostname: expectedHostname(), ip: await getClientIp() });
}

/**
 * 登录、订阅、读者留言提交时调用：没开启人机验证时直接放行；开启时核对令牌。
 * 失败原因只写进服务器日志，不告诉提交的人（提示文字由调用方按自己的语言给：m.email.humanCheckFailed）。
 */
export async function verifyHuman(token: unknown, action: TurnstileAction): Promise<{ ok: boolean }> {
  const config = await loadTurnstile();
  if (!config.enabled) return { ok: true };
  const verdict = await checkTurnstileToken(config.secret, token, action);
  if (verdict.ok) return { ok: true };
  if (verdict.reason !== "missing token") console.warn(`[turnstile] ${action} 验证失败：${verdict.reason}`);
  return { ok: false };
}
