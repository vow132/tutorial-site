import assert from "node:assert/strict";
import { test } from "node:test";
import { isUsableAdminPassword, normalizeSetupCode, setupCodeFrom, setupCodeMatches, setupHint } from "../lib/setup-code.mjs";

const prod = (secret) => ({ NODE_ENV: "production", AUTH_SECRET: secret });

test("the setup code is derived from AUTH_SECRET: stable, readable and different per site", () => {
  const code = setupCodeFrom(prod("site-a-secret-0123456789abcdef"));
  assert.match(code, /^[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}$/, "8 characters without 0/O/1/I/L");
  assert.equal(setupCodeFrom(prod("site-a-secret-0123456789abcdef")), code);
  assert.notEqual(setupCodeFrom(prod("site-b-secret-0123456789abcdef")), code);
});

test("without a usable AUTH_SECRET in production there is no setup code", () => {
  assert.equal(setupCodeFrom({ NODE_ENV: "production" }), null);
  assert.equal(setupCodeFrom(prod("请替换为随机长字符串")), null);
  assert.equal(setupCodeMatches("ABCD-EFGH", { NODE_ENV: "production" }), false);
  assert.match(setupHint("https://example.com", { NODE_ENV: "production" }), /AUTH_SECRET/);
  // 开发环境用固定的开发密钥，也能安装
  assert.ok(setupCodeFrom({ NODE_ENV: "development" }));
});

test("typed codes are matched ignoring case, spaces and dashes", () => {
  const env = prod("site-a-secret-0123456789abcdef");
  const code = setupCodeFrom(env);
  assert.equal(setupCodeMatches(code, env), true);
  assert.equal(setupCodeMatches(` ${code.toLowerCase().replace("-", " ")} `, env), true);
  assert.equal(setupCodeMatches(code.replace("-", ""), env), true);
  assert.equal(setupCodeMatches("AAAA-AAAA", env), false);
  assert.equal(setupCodeMatches("", env), false);
  assert.equal(setupCodeMatches(undefined, env), false);
  assert.equal(normalizeSetupCode(42), "");
  assert.match(setupHint("https://example.com/", env), new RegExp(`https://example\\.com/admin/setup.*${code}`));
});

test("an empty or copied-from-docs admin password counts as not set", () => {
  for (const value of [undefined, "", "   ", "请修改为强密码", " 请修改为强密码 "]) assert.equal(isUsableAdminPassword(value), false, String(value));
  assert.equal(isUsableAdminPassword("a-real-Passw0rd"), true);
});
