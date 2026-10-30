import { createHash, createHmac, timingSafeEqual } from "node:crypto";

export const SESSION_COOKIE = "admin_session";
export const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 7;
export const DEVICE_COOKIE = "admin_device";
export const DEVICE_MAX_AGE_SECONDS = 60 * 60 * 24 * 365;

type SessionPayload = {
  sub: string;
  exp: number;
  /** Fingerprint of the current bcrypt hash; rotates sessions on password changes. */
  cv?: string;
  /** Server-side AdminSession id; deleting the row revokes the cookie. */
  sid: string;
};

type DevicePayload = { u: string; d: string; exp: number };

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

/** The purpose prefix keeps a device token from being replayed as a session token. */
function signature(purpose: string, encoded: string) {
  return createHmac("sha256", secret()).update(`${purpose}.${encoded}`).digest("base64url");
}

function signToken(purpose: string, payload: object): string {
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${encoded}.${signature(purpose, encoded)}`;
}

function readToken(purpose: string, token: string | undefined | null): Record<string, unknown> | null {
  if (!token || token.length > 2048) return null;
  const separator = token.indexOf(".");
  if (separator <= 0 || separator === token.length - 1) return null;

  const encoded = token.slice(0, separator);
  const actualBytes = Buffer.from(token.slice(separator + 1));
  const expectedBytes = Buffer.from(signature(purpose, encoded));
  if (
    actualBytes.length !== expectedBytes.length ||
    !timingSafeEqual(actualBytes, expectedBytes)
  ) {
    return null;
  }

  try {
    const data: unknown = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8"));
    return data && typeof data === "object" ? (data as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

export function signSession(username: string, passwordHash: string, sessionId: string): string {
  const payload: SessionPayload = {
    sub: username,
    exp: Date.now() + SESSION_MAX_AGE_SECONDS * 1000,
    cv: credentialFingerprint(passwordHash),
    sid: sessionId,
  };
  return signToken("session", payload);
}

export function readSession(token: string | undefined | null): SessionPayload | null {
  const data = readToken("session", token);
  if (
    !data ||
    typeof data.sub !== "string" ||
    !data.sub ||
    typeof data.exp !== "number" ||
    data.exp <= Date.now() ||
    typeof data.sid !== "string" ||
    !data.sid ||
    (data.cv !== undefined && typeof data.cv !== "string")
  ) {
    return null;
  }
  return { sub: data.sub, exp: data.exp, cv: data.cv as string | undefined, sid: data.sid };
}

/** Signature/expiry only; the database check happens in getCurrentAdmin(). */
export function verifySession(token: string | undefined | null): boolean {
  return readSession(token) !== null;
}

export function signDevice(username: string, deviceId: string): string {
  const payload: DevicePayload = {
    u: username,
    d: deviceId,
    exp: Date.now() + DEVICE_MAX_AGE_SECONDS * 1000,
  };
  return signToken("device", payload);
}

/** Carries a not-yet-confirmed TOTP secret through the enable form for 15 minutes. */
export function signTotpSetup(adminId: number, totpSecret: string): string {
  return signToken("totp-setup", { a: adminId, s: totpSecret, exp: Date.now() + 15 * 60 * 1000 });
}

export function readTotpSetup(token: string | undefined | null, adminId: number): string | null {
  const data = readToken("totp-setup", token);
  if (
    !data ||
    data.a !== adminId ||
    typeof data.s !== "string" ||
    typeof data.exp !== "number" ||
    data.exp <= Date.now()
  ) {
    return null;
  }
  return data.s;
}

/** Returns the device id when the cookie was issued to this username. */
export function readDevice(token: string | undefined | null, username: string): string | null {
  const data = readToken("device", token);
  if (
    !data ||
    data.u !== username ||
    typeof data.d !== "string" ||
    !data.d ||
    typeof data.exp !== "number" ||
    data.exp <= Date.now()
  ) {
    return null;
  }
  return data.d;
}
