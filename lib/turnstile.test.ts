import assert from "node:assert/strict";
import { test } from "node:test";
import {
  disabledStoredTurnstile,
  isTurnstileKey,
  judgeSiteverify,
  maskKey,
  readStoredTurnstile,
  readToken,
  serializeStoredTurnstile,
  siteverifyUrl,
  verifyTurnstileToken,
} from "./turnstile";

const SITE_KEY = "0x4AAAAAAAB1cdEfGhIjKlMn";
const stored = serializeStoredTurnstile({ enabled: true, siteKey: SITE_KEY, secret: "enc:v1:sealed" });

test("stored config: only enabled when a valid site key and a secret are present", () => {
  assert.deepEqual(readStoredTurnstile(stored), { enabled: true, siteKey: SITE_KEY, secret: "enc:v1:sealed" });
  assert.equal(readStoredTurnstile(serializeStoredTurnstile({ enabled: true, siteKey: SITE_KEY, secret: "" })).enabled, false);
  assert.equal(readStoredTurnstile(JSON.stringify({ enabled: true, siteKey: "<script>", secret: "x" })).enabled, false);
  assert.equal(readStoredTurnstile(JSON.stringify({ enabled: "yes", siteKey: SITE_KEY, secret: "x" })).enabled, false);
  assert.deepEqual(readStoredTurnstile("not json"), { enabled: false, siteKey: "", secret: "" });
  assert.deepEqual(readStoredTurnstile(null), { enabled: false, siteKey: "", secret: "" });
});

test("admin:reset turns it off but keeps the keys; nothing to do when already off", () => {
  const off = disabledStoredTurnstile(stored);
  assert.ok(off);
  assert.deepEqual(readStoredTurnstile(off), { enabled: false, siteKey: SITE_KEY, secret: "enc:v1:sealed" });
  assert.equal(disabledStoredTurnstile(off), null);
  assert.equal(disabledStoredTurnstile(null), null);
});

test("keys, tokens and masking", () => {
  assert.ok(isTurnstileKey(SITE_KEY));
  assert.ok(isTurnstileKey("1x00000000000000000000AA"));
  assert.ok(!isTurnstileKey("short"));
  assert.ok(!isTurnstileKey("0x4AAAA AAAAB1cd"));
  assert.equal(maskKey(SITE_KEY), "0x4AAAAA…KlMn");
  assert.equal(readToken("  abc.def  "), "abc.def");
  assert.equal(readToken(""), null);
  assert.equal(readToken(42), null);
  assert.equal(readToken("x".repeat(2049)), null);
});

test("the siteverify URL can only be redirected to this machine (for tests)", () => {
  const real = "https://challenges.cloudflare.com/turnstile/v0/siteverify";
  assert.equal(siteverifyUrl({}), real);
  assert.equal(siteverifyUrl({ TURNSTILE_VERIFY_URL: "http://127.0.0.1:3199/siteverify" }), "http://127.0.0.1:3199/siteverify");
  assert.equal(siteverifyUrl({ TURNSTILE_VERIFY_URL: "http://localhost:3199/x" }), "http://localhost:3199/x");
  const warn = console.warn;
  console.warn = () => {};
  try {
    assert.equal(siteverifyUrl({ TURNSTILE_VERIFY_URL: "https://evil.example.com/siteverify" }), real);
    assert.equal(siteverifyUrl({ TURNSTILE_VERIFY_URL: "http://10.0.0.5/siteverify" }), real);
    assert.equal(siteverifyUrl({ TURNSTILE_VERIFY_URL: "not a url" }), real);
  } finally {
    console.warn = warn;
  }
});

test("siteverify result: success, the same action, and the site's hostname", () => {
  const expected = { action: "login" as const, hostname: "tutorial.example.com" };
  assert.deepEqual(judgeSiteverify({ success: true, action: "login", hostname: "tutorial.example.com" }, expected), { ok: true });
  assert.deepEqual(judgeSiteverify({ success: true, action: "login", hostname: "Tutorial.Example.com" }, expected), { ok: true });
  assert.equal(judgeSiteverify({ success: false, "error-codes": ["timeout-or-duplicate"] }, expected).ok, false);
  assert.match(
    (judgeSiteverify({ success: false, "error-codes": ["invalid-input-response"] }, expected) as { reason: string }).reason,
    /invalid-input-response/,
  );
  // 订阅表单拿到的令牌不能拿来登录
  assert.equal(judgeSiteverify({ success: true, action: "subscribe", hostname: "tutorial.example.com" }, expected).ok, false);
  assert.equal(judgeSiteverify({ success: true, action: "login", hostname: "staging.example.com" }, expected).ok, false);
  // 开发环境不核对域名（Cloudflare 测试密钥返回 example.com）
  assert.deepEqual(judgeSiteverify({ success: true, action: "login", hostname: "example.com" }, { action: "login", hostname: null }), { ok: true });
  assert.equal(judgeSiteverify({ success: "true" } as never, expected).ok, false);
});

test("verifyTurnstileToken posts the secret, token, IP and an idempotency key; network trouble fails closed", async () => {
  let sent: URLSearchParams | null = null;
  const ok = (async (_url: string, init: RequestInit) => {
    sent = init.body as URLSearchParams;
    return Response.json({ success: true, action: "feedback", hostname: "a.example.com" });
  }) as unknown as typeof fetch;
  const verdict = await verifyTurnstileToken({
    secret: "0xSECRETSECRET",
    token: "tok",
    action: "feedback",
    hostname: "a.example.com",
    ip: "203.0.113.9",
    fetchImpl: ok,
    url: "http://127.0.0.1:1/siteverify",
  });
  assert.deepEqual(verdict, { ok: true });
  const body = sent as unknown as URLSearchParams;
  assert.equal(body.get("secret"), "0xSECRETSECRET");
  assert.equal(body.get("response"), "tok");
  assert.equal(body.get("remoteip"), "203.0.113.9");
  assert.match(body.get("idempotency_key") ?? "", /^[0-9a-f-]{36}$/);

  const down = (async () => {
    throw new Error("ECONNREFUSED");
  }) as unknown as typeof fetch;
  const failed = await verifyTurnstileToken({ secret: "s", token: "t", action: "login", hostname: null, fetchImpl: down, url: "http://127.0.0.1:1/" });
  assert.deepEqual(failed, { ok: false, reason: "ECONNREFUSED" });

  const http500 = (async () => new Response("oops", { status: 500 })) as unknown as typeof fetch;
  assert.equal((await verifyTurnstileToken({ secret: "s", token: "t", action: "login", hostname: null, fetchImpl: http500, url: "http://127.0.0.1:1/" })).ok, false);

  const notJson = (async () => new Response("<html>", { status: 200 })) as unknown as typeof fetch;
  assert.equal((await verifyTurnstileToken({ secret: "s", token: "t", action: "login", hostname: null, fetchImpl: notJson, url: "http://127.0.0.1:1/" })).ok, false);
});
