import { createHash, createHmac, timingSafeEqual } from "node:crypto";

export const SESSION_COOKIE = "admin_session";
export const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 7;
const MAX_AGE_MS = SESSION_MAX_AGE_SECONDS * 1000;

type SessionPayload = {
  sub: string;
  exp: number;
  /** Fingerprint of the current bcrypt hash; rotates sessions on password changes. */
  cv?: string;
};

const DEV_FALLBACK_SECRET = "dev-secret-change-me-in-production";

function secret() {
  const value = process.env.AUTH_SECRET;
  if (!value || value === DEV_FALLBACK_SECRET) {
    // 已知密钥等于没有密钥：攻击者可自行签发有效会话，必须直接拒绝启动。
    if (process.env.NODE_ENV === "production") {
      throw new Error(
        "生产环境必须在 .env 中设置一个随机的 AUTH_SECRET（可用 openssl rand -base64 48 生成）"
      );
    }
    return DEV_FALLBACK_SECRET;
  }
  return value;
}

export function credentialFingerprint(passwordHash: string): string {
  return createHash("sha256").update(passwordHash).digest("base64url").slice(0, 32);
}

export function signSession(username: string, passwordHash?: string): string {
  const payload: SessionPayload = {
    sub: username,
    exp: Date.now() + MAX_AGE_MS,
    ...(passwordHash ? { cv: credentialFingerprint(passwordHash) } : {}),
  };
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = createHmac("sha256", secret())
    .update(encoded)
    .digest("base64url");
  return `${encoded}.${signature}`;
}

export function readSession(token: string | undefined | null): SessionPayload | null {
  if (!token) return null;
  const separator = token.indexOf(".");
  if (separator <= 0 || separator === token.length - 1) return null;

  const encoded = token.slice(0, separator);
  const signature = token.slice(separator + 1);
  const expected = createHmac("sha256", secret())
    .update(encoded)
    .digest("base64url");
  const actualBytes = Buffer.from(signature);
  const expectedBytes = Buffer.from(expected);
  if (
    actualBytes.length !== expectedBytes.length ||
    !timingSafeEqual(actualBytes, expectedBytes)
  ) {
    return null;
  }

  try {
    const data = JSON.parse(
      Buffer.from(encoded, "base64url").toString("utf8")
    ) as Partial<SessionPayload>;
    if (
      typeof data.sub !== "string" ||
      !data.sub ||
      typeof data.exp !== "number" ||
      data.exp <= Date.now() ||
      (data.cv !== undefined && typeof data.cv !== "string")
    ) {
      return null;
    }
    return { sub: data.sub, exp: data.exp, cv: data.cv };
  } catch {
    return null;
  }
}

export function verifySession(token: string | undefined | null): boolean {
  return readSession(token) !== null;
}