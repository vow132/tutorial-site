import assert from "node:assert/strict";
import { test } from "node:test";
import { recentDays, siteDay } from "./site-day";
import { helpfulSummary } from "./feedback";
import { i18nFor } from "./i18n/core";

const zh = i18nFor("zh-CN");

test("days follow Beijing time, not the server's time zone", () => {
  // UTC 16:30 已经是北京时间第二天 00:30
  assert.equal(siteDay(new Date("2026-11-19T16:30:00Z")), "2026-11-20");
  assert.equal(siteDay(new Date("2026-11-19T15:59:59Z")), "2026-11-19");
});

test("recent days end today and cross month and year boundaries", () => {
  assert.deepEqual(recentDays(3, new Date("2026-03-01T04:00:00Z")), ["2026-02-27", "2026-02-28", "2026-03-01"]);
  assert.deepEqual(recentDays(2, new Date("2027-01-01T01:00:00Z")), ["2026-12-31", "2027-01-01"]);
  const month = recentDays(30, new Date("2026-11-20T08:00:00Z"));
  assert.equal(month.length, 30);
  assert.equal(month[0], "2026-10-22");
  assert.equal(month.at(-1), "2026-11-20");
  assert.equal(new Set(month).size, 30);
});

test("helpful ratios are only shown once there are enough votes", () => {
  assert.equal(helpfulSummary(0, 0, zh).text, "暂无反馈");
  assert.deepEqual(helpfulSummary(2, 1, zh), { total: 3, ratio: null, text: "👍 2 · 👎 1" });
  assert.deepEqual(helpfulSummary(12, 2, zh), { total: 14, ratio: 86, text: "86% 有帮助（14 票）" });
});
