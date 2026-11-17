import { cookies } from "next/headers";
import { cookieOptions } from "@/lib/admin-auth";
import { readPasskeyChallenge, signPasskeyChallenge, type PasskeyPurpose } from "@/lib/session";
import { SITE_URL } from "@/lib/site-url";

/** 每个管理员最多登记的通行密钥数量。 */
export const MAX_PASSKEYS = 10;

const CHALLENGE_COOKIE = "admin_passkey";
const CHALLENGE_SECONDS = 5 * 60;

/**
 * WebAuthn 依赖方（RP）：通行密钥绑定在 SITE_URL 的域名上。浏览器只在 HTTPS
 * （或 localhost）下提供 WebAuthn，且 RP ID 不能是 IP 地址。
 */
export function relyingParty(): { rpID: string; origin: string } | { error: string } {
  let url: URL;
  try {
    url = new URL(SITE_URL);
  } catch {
    return { error: "SITE_URL 配置无效，无法使用通行密钥" };
  }
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(url.hostname) || url.hostname.startsWith("[")) {
    return { error: "通行密钥不支持用 IP 地址访问：请把 SITE_URL 设为站点域名" };
  }
  if (url.protocol !== "https:" && url.hostname !== "localhost") {
    return { error: "通行密钥需要 HTTPS：请为站点配置 HTTPS，并把 SITE_URL 设为 https:// 开头的域名" };
  }
  return { rpID: url.hostname, origin: url.origin };
}

export async function storePasskeyChallenge(
  purpose: PasskeyPurpose,
  challenge: string,
  extra: { adminId?: number; name?: string } = {},
) {
  const store = await cookies();
  store.set(
    CHALLENGE_COOKIE,
    signPasskeyChallenge(purpose, challenge, extra),
    await cookieOptions(CHALLENGE_SECONDS, "/admin"),
  );
}

/** 读取并立即作废挑战：每个挑战只能用一次。 */
export async function takePasskeyChallenge(purpose: PasskeyPurpose) {
  const store = await cookies();
  const challenge = readPasskeyChallenge(store.get(CHALLENGE_COOKIE)?.value, purpose);
  store.set(CHALLENGE_COOKIE, "", await cookieOptions(0, "/admin"));
  return challenge;
}

export function encodeTransports(transports: readonly string[] | undefined) {
  return transports && transports.length > 0 ? transports.join(",") : null;
}

export function decodeTransports(value: string | null) {
  return value ? value.split(",").filter(Boolean) : undefined;
}
