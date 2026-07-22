import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import {
  credentialFingerprint,
  readSession,
  SESSION_COOKIE,
} from "@/lib/session";

/** Resolve and validate the administrator behind the signed session cookie. */
export async function getCurrentAdmin() {
  const store = await cookies();
  const session = readSession(store.get(SESSION_COOKIE)?.value);
  if (!session) return null;

  const admin = await prisma.admin.findUnique({ where: { username: session.sub } });
  if (!admin) return null;

  // Require the credential fingerprint so password changes revoke every older session.
  if (!session.cv || session.cv !== credentialFingerprint(admin.password)) {
    return null;
  }

  return admin;
}

export async function requireAuth() {
  const admin = await getCurrentAdmin();
  if (!admin) throw new Error("未登录或会话已过期");
  return admin;
}