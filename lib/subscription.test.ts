import assert from "node:assert/strict";
import { test } from "node:test";
import {
  confirmEmail,
  maskEmail,
  newTutorialEmail,
  normalizeEmail,
  readMailConfig,
  readSubscriberToken,
  signSubscriberToken,
  validateMailConfig,
  emptyMailConfig,
} from "./subscription";
import { parseStartHereInput, parseSupportInput, pickStartHereSeries, readArticleMotion, readStartHere, readSupport } from "./settings-extras";

test("emails are normalised and obviously bad ones rejected", () => {
  assert.equal(normalizeEmail("  Reader@Example.COM "), "reader@example.com");
  assert.equal(normalizeEmail("a@b"), null);
  assert.equal(normalizeEmail("no-at.example.com"), null);
  assert.equal(normalizeEmail("x y@example.com"), null);
  assert.equal(normalizeEmail(`${"a".repeat(250)}@example.com`), null);
  assert.equal(normalizeEmail(42), null);
  assert.equal(maskEmail("zhangsan@example.com"), "zha***@example.com");
  assert.equal(maskEmail("ab@example.com"), "a***@example.com");
});

test("subscriber tokens are bound to the id and the purpose", () => {
  const token = signSubscriberToken(42, "confirm");
  assert.equal(readSubscriberToken(token, "confirm"), 42);
  assert.equal(readSubscriberToken(token, "unsubscribe"), null);
  assert.equal(readSubscriberToken(token.replace(/^42\./, "43."), "confirm"), null);
  const tampered = `${token.slice(0, -1)}${token.endsWith("A") ? "B" : "A"}`;
  assert.equal(readSubscriberToken(tampered, "confirm"), null);
  assert.equal(readSubscriberToken("garbage", "confirm"), null);
  assert.equal(readSubscriberToken(undefined, "confirm"), null);
});

test("mail settings are validated and read back safely", () => {
  const base = { ...emptyMailConfig, enabled: true, host: "smtp.example.com", port: 465, fromEmail: "noreply@example.com" };
  assert.equal(validateMailConfig(base), null);
  assert.equal(validateMailConfig({ ...emptyMailConfig }), null);
  assert.match(validateMailConfig({ ...base, host: "smtp example" })!, /host/);
  assert.match(validateMailConfig({ ...base, port: 70000 })!, /port/);
  assert.match(validateMailConfig({ ...base, fromEmail: "nope" })!, /fromEmail/);
  assert.deepEqual(readMailConfig({ host: "h", port: "x", enabled: "yes" }), { ...emptyMailConfig, host: "h" });
});

test("email bodies escape content and carry the right links", () => {
  const confirm = confirmEmail({ siteName: "教程网", confirmUrl: "https://example.com/subscribe/confirm?token=1.abc" });
  assert.match(confirm.subject, /确认订阅/);
  assert.match(confirm.text, /token=1\.abc/);
  const mail = newTutorialEmail({
    siteName: "教程网",
    title: "<script>alert(1)</script> 入门",
    excerpt: "a & b",
    url: "https://example.com/tutorials/x",
    unsubscribeUrl: "https://example.com/subscribe/unsubscribe?token=1.def",
  });
  assert.equal(mail.subject, "新教程：<script>alert(1)</script> 入门");
  assert.doesNotMatch(mail.html, /<script>/);
  assert.match(mail.html, /&lt;script&gt;/);
  assert.match(mail.html, /a &amp; b/);
  assert.match(mail.html, /unsubscribe\?token=1\.def/);
  assert.match(mail.text, /退订：https:\/\/example\.com\/subscribe\/unsubscribe/);
});

test("support settings accept only uploaded images and safe links", () => {
  const empty = { donationText: "", wechatQr: "", alipayQr: "", sponsorText: "", sponsorUrl: "", sponsorImage: "" };
  assert.deepEqual(parseSupportInput(empty), { data: empty });
  assert.ok("data" in parseSupportInput({ ...empty, wechatQr: "/uploads/qr-1.png", sponsorText: "某某云", sponsorUrl: "https://example.com" }));
  assert.match((parseSupportInput({ ...empty, wechatQr: "https://evil.example/qr.png" }) as { error: string }).error, /上传/);
  assert.match((parseSupportInput({ ...empty, sponsorText: "x", sponsorUrl: "javascript:alert(1)" }) as { error: string }).error, /https/);
  assert.match((parseSupportInput({ ...empty, sponsorUrl: "https://example.com" }) as { error: string }).error, /赞助文字/);
  assert.deepEqual(readSupport(null), empty);
});

test("start-here and motion settings fall back to defaults", () => {
  assert.equal(readArticleMotion(undefined), "calm");
  assert.equal(readArticleMotion("full"), "full");
  assert.equal(readStartHere({ enabled: false }).enabled, false);
  assert.equal(readStartHere({}).title, "从这里开始");
  assert.deepEqual(parseStartHereInput({ enabled: true, title: " ", intro: "x", seriesSlugs: ["a", "a", "bad slug", "b"] }), {
    enabled: true,
    title: "从这里开始",
    intro: "x",
    seriesSlugs: ["a", "b"],
  });
  const all = [{ slug: "c" }, { slug: "b" }, { slug: "a" }, { slug: "d" }];
  assert.deepEqual(pickStartHereSeries(all, []), [{ slug: "c" }, { slug: "b" }, { slug: "a" }]);
  assert.deepEqual(pickStartHereSeries(all, ["a", "gone", "c"]), [{ slug: "a" }, { slug: "c" }]);
});
