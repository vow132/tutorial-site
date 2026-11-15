import assert from "node:assert/strict";
import test from "node:test";
import {
  normalizeVerificationCode,
  readVerification,
  verificationMetadata,
} from "./search-verification";

test("verification codes accept a bare code or the whole meta tag", () => {
  assert.equal(normalizeVerificationCode("  abc_DEF-123.x  "), "abc_DEF-123.x");
  assert.equal(
    normalizeVerificationCode('<meta name="baidu-site-verification" content="codeva-AbC123" />'),
    "codeva-AbC123",
  );
  assert.equal(normalizeVerificationCode("<meta content='1A2B3C' name='msvalidate.01'>"), "1A2B3C");
  assert.equal(normalizeVerificationCode(""), "");
});

test("malformed verification codes are rejected", () => {
  assert.equal(normalizeVerificationCode("has space"), null);
  assert.equal(normalizeVerificationCode('"><script>alert(1)</script>'), null);
  assert.equal(normalizeVerificationCode('<meta name="x" content="">'), null);
  assert.equal(normalizeVerificationCode("a".repeat(201)), null);
});

test("stored verification ignores unknown engines and bad values", () => {
  assert.deepEqual(readVerification({ google: "g1", evil: "x", baidu: "bad value", bing: 3 }), {
    google: "g1",
  });
  assert.deepEqual(readVerification(null), {});
  assert.deepEqual(readVerification("google"), {});
});

test("verification maps to Next metadata with the right meta names", () => {
  assert.deepEqual(
    verificationMetadata({ google: "g1", yandex: "y1", bing: "b1", baidu: "d1", so360: "s1" }),
    {
      google: "g1",
      yandex: "y1",
      other: {
        "msvalidate.01": "b1",
        "baidu-site-verification": "d1",
        "360-site-verification": "s1",
      },
    },
  );
  assert.equal(verificationMetadata({}), undefined);
});
