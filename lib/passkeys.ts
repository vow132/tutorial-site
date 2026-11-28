import { cookies } from "next/headers";
import { cookieOptions } from "@/lib/admin-auth";
import { sharedOneTimeSet } from "@/lib/rate-limit";
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
/** 不能用通行密钥的原因（字典 m.admin.passkeys 里的键） */
export type RelyingPartyProblem = "rpInvalidUrl" | "rpIpAddress" | "rpNeedsHttps";

export function relyingParty(): { rpID: string; origin: string } | { error: RelyingPartyProblem } {
  let url: URL;
  try {
    url = new URL(SITE_URL);
  } catch {
    return { error: "rpInvalidUrl" };
  }
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(url.hostname) || url.hostname.startsWith("[")) {
    return { error: "rpIpAddress" };
  }
  if (url.protocol !== "https:" && url.hostname !== "localhost") {
    return { error: "rpNeedsHttps" };
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

/**
 * 用过的挑战。挑战放在签名 Cookie 里，用一次就清掉 Cookie；但 Cookie 本身是无状态的，
 * 同一个 Cookie 在极短时间内并发提交两次时两次都能读到。这里在服务端记下用过的挑战（有效期内），
 * 第二次一律拒绝，不依赖认证器的签名计数器（很多同步型通行密钥的计数器始终是 0）。
 */
const usedChallenges = sharedOneTimeSet("passkey-challenges", CHALLENGE_SECONDS * 1000);

/** 读取并立即作废挑战：每个挑战只能用一次。 */
export async function takePasskeyChallenge(purpose: PasskeyPurpose) {
  const store = await cookies();
  const challenge = readPasskeyChallenge(store.get(CHALLENGE_COOKIE)?.value, purpose);
  store.set(CHALLENGE_COOKIE, "", await cookieOptions(0, "/admin"));
  if (!challenge || !usedChallenges.claim(challenge.challenge)) return null;
  return challenge;
}

export function encodeTransports(transports: readonly string[] | undefined) {
  return transports && transports.length > 0 ? transports.join(",") : null;
}

export function decodeTransports(value: string | null) {
  return value ? value.split(",").filter(Boolean) : undefined;
}
