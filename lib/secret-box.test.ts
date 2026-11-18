import assert from "node:assert/strict";
import { test } from "node:test";
import { SecretBoxError, isSealed, needsReseal, openSecret, sealSecret, secretKeys } from "./secret-box.mjs";

const prod = { NODE_ENV: "production", AUTH_SECRET: "a".repeat(48) };

test("sealed values round-trip and never contain the plaintext", () => {
  const sealed = sealSecret("JBSWY3DPEHPK3PXP", "totp", prod);
  assert.ok(isSealed(sealed));
  assert.ok(!sealed.includes("JBSWY3DPEHPK3PXP"));
  assert.equal(openSecret(sealed, "totp", prod), "JBSWY3DPEHPK3PXP");
  // 同一明文每次加密结果不同（随机 IV）
  assert.notEqual(sealSecret("JBSWY3DPEHPK3PXP", "totp", prod), sealed);
});

test("legacy plaintext is read as-is and flagged for re-encryption", () => {
  assert.equal(openSecret("JBSWY3DPEHPK3PXP", "totp", prod), "JBSWY3DPEHPK3PXP");
  assert.equal(needsReseal("JBSWY3DPEHPK3PXP", prod), true);
  assert.equal(needsReseal(sealSecret("x", "totp", prod), prod), false);
});

test("a ciphertext cannot be reused for another purpose or tampered with", () => {
  const sealed = sealSecret("secret", "totp", prod);
  assert.throws(() => openSecret(sealed, "alerts", prod), SecretBoxError);
  const parts = sealed.split(":");
  parts[5] = Buffer.from("other!").toString("base64url");
  assert.throws(() => openSecret(parts.join(":"), "totp", prod), SecretBoxError);
});

test("a changed AUTH_SECRET cannot decrypt; DATA_ENCRYPTION_KEY takes over and keeps old data readable", () => {
  const old = sealSecret("secret", "totp", prod);
  assert.throws(() => openSecret(old, "totp", { ...prod, AUTH_SECRET: "b".repeat(48) }), SecretBoxError);

  const withDataKey = { ...prod, DATA_ENCRYPTION_KEY: "k".repeat(48) };
  assert.equal(secretKeys(withDataKey).length, 2);
  assert.equal(openSecret(old, "totp", withDataKey), "secret");
  assert.equal(needsReseal(old, withDataKey), true);
  const resealed = sealSecret("secret", "totp", withDataKey);
  // 有了独立的数据密钥后，更换 AUTH_SECRET 不再影响已加密的数据。
  assert.equal(openSecret(resealed, "totp", { ...withDataKey, AUTH_SECRET: "c".repeat(48) }), "secret");
});

test("production without any key refuses to encrypt", () => {
  assert.throws(() => sealSecret("x", "totp", { NODE_ENV: "production" }), /AUTH_SECRET/);
  assert.equal(secretKeys({ NODE_ENV: "development" }).length, 1);
});
