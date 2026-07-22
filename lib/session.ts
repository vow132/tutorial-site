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

function secret() {
  return process.env.AUTH_SECRET ?? "dev-secret-change-me-in-production";
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