import { prisma } from "@/lib/prisma";
import { hashRecoveryCode, normalizeRecoveryCode } from "@/lib/recovery-codes";
import { openSecret, sealSecret } from "@/lib/secret-box.mjs";
import { verifyTotp } from "@/lib/totp";

const TOTP_PURPOSE = "totp";

/** 两步验证密钥加密后存库。 */
export function sealTotpSecret(secret: string) {
  return sealSecret(secret, TOTP_PURPOSE);
}

/** 读出明文密钥（兼容加密前的旧数据）；加密密钥已更换、解不开时返回 null。 */
export function openTotpSecret(stored: string): string | null {
  try {
    return openSecret(stored, TOTP_PURPOSE);
  } catch {
    return null;
  }
}

export type SecondFactorResult =
  | { ok: true; method: "totp" }
  | { ok: true; method: "recovery"; remaining: number }
  | { ok: false; reason: "invalid" | "locked" };

type AdminFactor = { id: number; totpSecret: string | null; totpLastStep: number | null };

/**
 * 校验第二因素：6 位验证码，或一次性恢复码。两者都用条件更新/删除实现，
 * 同一个码被并发提交时只有一个请求能成功。
 */
export async function verifySecondFactor(admin: AdminFactor, input: string): Promise<SecondFactorResult> {
  const value = input.trim();

  if (/^\d[\d\s]{5,6}$/.test(value)) {
    const secret = admin.totpSecret ? openTotpSecret(admin.totpSecret) : null;
    if (!secret) return { ok: false, reason: admin.totpSecret ? "locked" : "invalid" };
    const step = verifyTotp(secret, value, admin.totpLastStep);
    if (step === null) return { ok: false, reason: "invalid" };
    const { count } = await prisma.admin.updateMany({
      where: { id: admin.id, OR: [{ totpLastStep: null }, { totpLastStep: { lt: step } }] },
      data: { totpLastStep: step },
    });
    return count === 1 ? { ok: true, method: "totp" } : { ok: false, reason: "invalid" };
  }

  const code = normalizeRecoveryCode(value);
  if (!code) return { ok: false, reason: "invalid" };
  const { count } = await prisma.adminRecoveryCode.deleteMany({
    where: { adminId: admin.id, codeHash: hashRecoveryCode(code) },
  });
  if (count !== 1) return { ok: false, reason: "invalid" };
  const remaining = await prisma.adminRecoveryCode.count({ where: { adminId: admin.id } });
  return { ok: true, method: "recovery", remaining };
}

