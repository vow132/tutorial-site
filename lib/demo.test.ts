import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { demoAccount, displayEmail, displayIp, isDemoMode, maskEmail, maskIp } from "./demo";

const saved = { ...process.env };
afterEach(() => {
  for (const key of ["DEMO_MODE", "ADMIN_USERNAME", "ADMIN_PASSWORD"]) {
    if (saved[key] === undefined) delete process.env[key];
    else process.env[key] = saved[key];
  }
});

test("demo mode is opt-in and read at runtime", () => {
  delete process.env.DEMO_MODE;
  assert.equal(isDemoMode(), false);
  assert.equal(demoAccount(), null);
  for (const value of ["1", "yes", "TRUE ", "false"]) {
    process.env.DEMO_MODE = value;
    assert.equal(isDemoMode(), false, value);
  }
  process.env.DEMO_MODE = "true";
  assert.equal(isDemoMode(), true);
});

test("the published demo account is the seeded admin, and only when a password is set", () => {
  process.env.DEMO_MODE = "true";
  delete process.env.ADMIN_PASSWORD;
  assert.equal(demoAccount(), null);
  process.env.ADMIN_PASSWORD = "demo-pass-123";
  delete process.env.ADMIN_USERNAME;
  assert.deepEqual(demoAccount(), { username: "admin", password: "demo-pass-123" });
  process.env.ADMIN_USERNAME = "editor";
  assert.deepEqual(demoAccount(), { username: "editor", password: "demo-pass-123" });
});

test("visitor IPs and emails are masked only in demo mode", () => {
  assert.equal(maskIp("203.0.113.45"), "203.0.*.*");
  assert.equal(maskIp("2001:db8:85a3::8a2e:370:7334"), "2001:db8:*");
  assert.equal(maskIp("unknown"), "*");
  assert.equal(maskEmail("reader@example.com"), "r***@example.com");
  assert.equal(maskEmail("张三@例子.中国"), "张***@例子.中国");
  assert.equal(maskEmail("broken"), "***");

  delete process.env.DEMO_MODE;
  assert.equal(displayIp("203.0.113.45"), "203.0.113.45");
  assert.equal(displayEmail("reader@example.com"), "reader@example.com");
  process.env.DEMO_MODE = "true";
  assert.equal(displayIp("203.0.113.45"), "203.0.*.*");
  assert.equal(displayIp(null), null);
  assert.equal(displayEmail("reader@example.com"), "r***@example.com");
});
