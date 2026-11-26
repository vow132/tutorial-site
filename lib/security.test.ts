import assert from "node:assert/strict";
import test from "node:test";
import { passwordProblem } from "./password-policy";
import { OneTimeSet, RateLimiter } from "./rate-limit";
import { sanitizeArticleHtml } from "./sanitize";
import { readDevice, readSession, readTotpSetup, signDevice, signSession, signTotpSetup } from "./session";
import { base32Decode, base32Encode, totpCode, verifyTotp } from "./totp";

test("TOTP matches the RFC 6238 SHA-1 test vectors", () => {
  const secret = base32Encode(Buffer.from("12345678901234567890"));
  assert.equal(base32Decode(secret).toString(), "12345678901234567890");
  // RFC 6238 Appendix B: T=59s → 94287082, T=1111111109s → 07081804 (8 digits).
  assert.equal(totpCode(secret, Math.floor(59 / 30), 8), "94287082");
  assert.equal(totpCode(secret, Math.floor(1111111109 / 30), 8), "07081804");
});

test("TOTP verification allows one step of drift and rejects replays", () => {
  const secret = base32Encode(Buffer.from("12345678901234567890"));
  const now = 1_700_000_000_000;
  const step = Math.floor(now / 30_000);
  const code = totpCode(secret, step);
  assert.equal(verifyTotp(secret, code, null, now), step);
  assert.equal(verifyTotp(secret, code.slice(0, 3) + " " + code.slice(3), null, now), step);
  assert.equal(verifyTotp(secret, totpCode(secret, step - 1), null, now), step - 1);
  assert.equal(verifyTotp(secret, totpCode(secret, step - 2), null, now), null);
  assert.equal(verifyTotp(secret, code, step, now), null, "same step cannot be used twice");
  assert.equal(verifyTotp(secret, "12345", null, now), null);
});

test("rate limiter counts per key, expires, and stays bounded", () => {
  const limiter = new RateLimiter(2, 1000, 3);
  limiter.hit("a", 0);
  assert.equal(limiter.retryAfter("a", 0), 0);
  limiter.hit("a", 0);
  assert.equal(limiter.retryAfter("a", 0), 1);
  assert.equal(limiter.retryAfter("a", 1000), 0, "window expired");
  for (const key of ["b", "c", "d", "e"]) limiter.hit(key, 2000);
  limiter.hit("e", 2000);
  assert.equal(limiter.retryAfter("e", 2000), 1);
  assert.equal(limiter.retryAfter("b", 2000), 0, "oldest entry evicted at capacity");
});

test("flooding the rate limiter with new keys does not evict a key that is currently blocked", () => {
  const limiter = new RateLimiter(3, 60_000, 100);
  for (let i = 0; i < 3; i++) limiter.hit("attacker", 0);
  assert.ok(limiter.retryAfter("attacker", 0) > 0);
  // 一万个不同的 key：容量只有 100，旧的计数被淘汰，但正在限制中的那条留着
  for (let i = 0; i < 10_000; i++) limiter.hit(`junk-${i}`, 1);
  assert.ok(limiter.retryAfter("attacker", 2) > 0, "blocked entry survived the flood");
  assert.equal(limiter.retryAfter("junk-0", 2), 0, "unblocked entries were evicted instead");
  assert.equal(limiter.retryAfter("attacker", 60_000), 0, "and it still expires on time");
});

test("one-time values (passkey challenges) can be claimed once within their lifetime", () => {
  const used = new OneTimeSet(300_000, 3);
  assert.equal(used.claim("c1", 0), true);
  assert.equal(used.claim("c1", 1), false, "replaying the same challenge is refused");
  assert.equal(used.claim("c2", 1), true);
  assert.equal(used.claim("c1", 300_001), true, "forgotten after it expires (the signed cookie has expired too)");
  for (const value of ["a", "b", "c", "d"]) used.claim(value, 300_002);
  assert.equal(used.claim("d", 300_003), false, "still bounded in size, newest kept");
});

test("article sanitizer keeps editor markup and strips script vectors", () => {
  const safe =
    '<h2>标题</h2><p><strong>粗</strong> <span style="color:#e5484d">红</span></p>' +
    '<pre><code class="language-js">a &lt; b</code></pre><img src="/uploads/a.png" alt="a" />';
  assert.equal(sanitizeArticleHtml(safe), safe);

  const hostile = sanitizeArticleHtml(
    '<script>alert(1)</script><img src="x" onerror="alert(1)"><a href="javascript:alert(1)">x</a>' +
    '<a href="//evil.test">y</a><iframe srcdoc="<script>1</script>"></iframe>' +
    '<span style="background:url(javascript:alert(1))">z</span><img src="data:image/svg+xml;base64,AA">',
  );
  for (const fragment of ["<script", "onerror", "javascript:", "evil.test", "<iframe", "url(", "data:"]) {
    assert.ok(!hostile.includes(fragment), `${fragment} should be removed: ${hostile}`);
  }
  assert.match(
    sanitizeArticleHtml('<a href="https://example.com" target="_blank">x</a>'),
    /rel="noopener noreferrer nofollow"/,
  );
});

test("signed tokens reject tampering and cross-purpose reuse", () => {
  const token = signSession("admin", "$2b$12$hash", "session-id");
  assert.equal(readSession(token)?.sid, "session-id");
  const [payload, signature] = token.split(".");
  const forged = Buffer.from(JSON.stringify({ sub: "admin", exp: Date.now() + 1e9, sid: "other" })).toString("base64url");
  assert.equal(readSession(`${forged}.${signature}`), null);
  assert.equal(readSession(`${payload}.${signature.slice(0, -2)}xx`), null);

  const device = signDevice("admin", "device-1");
  assert.equal(readDevice(device, "admin"), "device-1");
  assert.equal(readDevice(device, "someone-else"), null);
  assert.equal(readSession(device), null, "a device cookie is not a session");

  const setup = signTotpSetup(1, "SECRET");
  assert.equal(readTotpSetup(setup, 1), "SECRET");
  assert.equal(readTotpSetup(setup, 2), null);
});

test("password policy rejects defaults and weak passwords", () => {
  assert.ok(passwordProblem("admin123456", "admin"));
  assert.ok(passwordProblem("short", "admin"));
  assert.ok(passwordProblem("myadminpassword", "admin"));
  assert.ok(passwordProblem("aaaaaaaaaaaa", "admin"));
  assert.ok(passwordProblem("密".repeat(30), "admin"), "over 72 bytes");
  assert.equal(passwordProblem("correct-horse-battery", "admin"), null);
});

test("callout boxes keep only the known types", () => {
  const safe = '<div data-callout="warning"><p>注意</p><ul><li>x</li></ul></div>';
  assert.equal(sanitizeArticleHtml(safe), safe);
  assert.equal(
    sanitizeArticleHtml('<div data-callout="x" onclick="alert(1)" style="color:red" class="a"><p>y</p></div>'),
    "<div><p>y</p></div>",
  );
});
