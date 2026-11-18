import assert from "node:assert/strict";
import { test } from "node:test";
import { RECOVERY_CODE_COUNT, generateRecoveryCodes, hashRecoveryCode, normalizeRecoveryCode } from "./recovery-codes";

test("recovery codes are unique, readable and stored only as hashes", () => {
  const { codes, hashes } = generateRecoveryCodes();
  assert.equal(codes.length, RECOVERY_CODE_COUNT);
  assert.equal(new Set(codes).size, codes.length);
  for (const code of codes) assert.match(code, /^[a-z2-7]{4}(-[a-z2-7]{4}){3}$/);
  assert.equal(hashes[0], hashRecoveryCode(normalizeRecoveryCode(codes[0])!));
  assert.ok(!hashes.some((hash) => codes.some((code) => hash.includes(code.replace(/-/g, "")))));
});

test("typed codes are normalized; anything else is rejected", () => {
  assert.equal(normalizeRecoveryCode(" ABCD-efgh ijkl-mnop "), "abcdefghijklmnop");
  assert.equal(normalizeRecoveryCode("123456"), null);
  assert.equal(normalizeRecoveryCode("abcd-efgh-ijkl-mno1"), null);
  assert.equal(normalizeRecoveryCode("abcd-efgh-ijkl"), null);
});
