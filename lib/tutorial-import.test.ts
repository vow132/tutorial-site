import assert from "node:assert/strict";
import { test } from "node:test";
import { cleanImportTags, importDates, slugCandidates } from "./tutorial-import";
import { normalizeSlug } from "./tutorial-slug";

test("imported tags are normalised, de-duplicated by alias and capped at eight", () => {
  assert.deepEqual(cleanImportTags(["CSS", "css", " Flexbox ", "C++", "c-plus-plus", 42, "", "布局"]), ["CSS", "Flexbox", "C++", "布局"]);
  assert.deepEqual(cleanImportTags(Array.from({ length: 12 }, (_, i) => `标签${i}`)).length, 8);
  assert.deepEqual(cleanImportTags(["这是一个非常非常非常非常非常非常非常非常长的标签名字", "OK"]), ["OK"]);
  assert.deepEqual(cleanImportTags("not an array"), []);
});

test("original dates are kept unless missing, invalid or in the future", () => {
  const now = new Date("2026-11-23T00:00:00Z");
  assert.deepEqual(importDates("2021-05-02T00:00:00Z", "2021-06-01T00:00:00Z", now), {
    createdAt: new Date("2021-05-02T00:00:00Z"),
    updatedAt: new Date("2021-06-01T00:00:00Z"),
  });
  // 没有修改时间：等于发布时间（不会变成今天）
  assert.deepEqual(importDates("2021-05-02T00:00:00Z", null, now).updatedAt, new Date("2021-05-02T00:00:00Z"));
  // 修改时间早于发布时间
  assert.deepEqual(importDates("2021-05-02T00:00:00Z", "2020-01-01T00:00:00Z", now).updatedAt, new Date("2021-05-02T00:00:00Z"));
  assert.deepEqual(importDates("garbage", undefined, now), { createdAt: now, updatedAt: now });
  assert.deepEqual(importDates("2030-01-01T00:00:00Z", null, now).createdAt, now);
});

test("conflicting slugs get -2, -3 … and never exceed 80 characters", () => {
  assert.deepEqual(slugCandidates("hello", 3), ["hello", "hello-2", "hello-3"]);
  const long = "a".repeat(80);
  for (const candidate of slugCandidates(long, 12)) assert.ok(candidate.length <= 80, candidate);
  assert.equal(slugCandidates(`${"b".repeat(78)}-c`, 2)[1], `${"b".repeat(78)}-2`);
  assert.equal(normalizeSlug("Hello World!", ""), "hello-world");
  assert.equal(normalizeSlug("", "Git 入门"), "git-入门");
  assert.equal(normalizeSlug(`${"x".repeat(79)}-yz`, ""), "x".repeat(79));
});
