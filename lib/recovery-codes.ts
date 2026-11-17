import { createHash, randomBytes } from "node:crypto";

/**
 * 两步验证恢复码：手机丢失时代替 6 位验证码登录，每个只能用一次。
 * 每个码 16 位 base32（80 位随机数），数据库里只存 SHA-256：
 * 熵足够高，泄露的哈希无法暴力反推；也不依赖 AUTH_SECRET，更换密钥后仍然可用。
 */
export const RECOVERY_CODE_COUNT = 10;

const ALPHABET = "abcdefghijklmnopqrstuvwxyz234567";

function randomCode() {
  const bytes = randomBytes(10);
  let bits = 0;
  let value = 0;
  let output = "";
  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      output += ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  return output;
}

/** 生成一组新码：codes 只给用户看一次，hashes 存库。 */
export function generateRecoveryCodes(count = RECOVERY_CODE_COUNT) {
  const codes = Array.from({ length: count }, () => randomCode().match(/.{4}/g)!.join("-"));
  return { codes, hashes: codes.map((code) => hashRecoveryCode(normalizeRecoveryCode(code)!)) };
}

/** 去掉空格、连字符并转小写；格式不对返回 null。 */
export function normalizeRecoveryCode(input: string): string | null {
  const code = input.toLowerCase().replace(/[\s-]/g, "");
  return /^[a-z2-7]{16}$/.test(code) ? code : null;
}

export function hashRecoveryCode(normalized: string) {
  return createHash("sha256").update(normalized).digest("hex");
}
