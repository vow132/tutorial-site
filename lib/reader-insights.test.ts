import assert from "node:assert/strict";
import { test } from "node:test";
import { DIRECT, INTERNAL, describeSource, referrerSource } from "./referrer";
import { cleanFeedbackMessage, readRate } from "./feedback";
import { normalizeSearchQuery } from "./search-query";

test("referrers are reduced to a bare host; this site and empty referrers are labelled", () => {
  assert.equal(referrerSource("www.baidu.com", "example.com"), "baidu.com");
  assert.equal(referrerSource("M.Zhihu.com", "example.com"), "zhihu.com");
  assert.equal(referrerSource("", "example.com"), DIRECT);
  assert.equal(referrerSource(undefined, "example.com"), DIRECT);
  assert.equal(referrerSource("www.example.com", "example.com"), INTERNAL);
  assert.equal(referrerSource("blog.example.com", "www.example.com"), INTERNAL);
  assert.equal(referrerSource(INTERNAL, null), INTERNAL);
  // 不是域名的值（脚本伪造的路径、超长字符串）一律当作直接访问
  assert.equal(referrerSource("https://evil.example/x?y", "example.com"), DIRECT);
  assert.equal(referrerSource(`${"a".repeat(250)}.com`, "example.com"), DIRECT);
});

test("known sources get friendly names and a kind", () => {
  assert.deepEqual(describeSource("baidu.com"), { label: "百度", kind: "search" });
  assert.deepEqual(describeSource("google.com.hk"), { label: "谷歌", kind: "search" });
  assert.deepEqual(describeSource("mp.weixin.qq.com"), { label: "微信", kind: "social" });
  assert.deepEqual(describeSource("com.tencent.mm"), { label: "微信", kind: "social" });
  assert.deepEqual(describeSource("juejin.cn"), { label: "掘金", kind: "social" });
  assert.deepEqual(describeSource(DIRECT), { label: "直接访问 / 书签", kind: "direct" });
  assert.deepEqual(describeSource("someblog.dev"), { label: "someblog.dev", kind: "site" });
});

test("read rates need enough views", () => {
  assert.equal(readRate(9, 9), null);
  assert.equal(readRate(40, 10), 25);
  assert.equal(readRate(10, 12), 100);
});

test("reader messages are cleaned and length-limited", () => {
  assert.equal(cleanFeedbackMessage("  第三步报错，\r\n\r\n\r\n\r\n能补充一下吗？\u0007 "), "第三步报错，\n\n能补充一下吗？");
  assert.equal(cleanFeedbackMessage("好"), null);
  assert.equal(cleanFeedbackMessage(42), null);
  assert.equal(cleanFeedbackMessage("字".repeat(600))?.length, 500);
  assert.equal(cleanFeedbackMessage("a‮b​c"), "abc");
});

test("search queries are normalised for counting", () => {
  assert.equal(normalizeSearchQuery("  Redis   缓存 "), "redis 缓存");
  assert.equal(normalizeSearchQuery("ＮＧＩＮＸ"), "nginx");
  assert.equal(normalizeSearchQuery("x".repeat(150)).length, 100);
});
