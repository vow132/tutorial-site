import assert from "node:assert/strict";
import { test } from "node:test";
import { parseSeriesInput, seriesPath, seriesPosition } from "./series";

test("series input is trimmed and gets a readable slug", () => {
  assert.deepEqual(parseSeriesInput({ title: "  从零搭建 Next.js 博客 ", slug: "", description: "  " }), {
    data: { title: "从零搭建 Next.js 博客", slug: "从零搭建-next-js-博客", description: null },
  });
  assert.deepEqual(parseSeriesInput({ title: "Docker 入门", slug: "Docker Basics", description: "五篇" }), {
    data: { title: "Docker 入门", slug: "docker-basics", description: "五篇" },
  });
  assert.equal(seriesPath("docker-入门"), "/series/docker-%E5%85%A5%E9%97%A8");
});

test("series input rejects empty or oversized values", () => {
  assert.deepEqual(parseSeriesInput({ title: " ", slug: "", description: "" }), { error: "请输入系列名称" });
  assert.ok("error" in parseSeriesInput({ title: "长".repeat(61), slug: "", description: "" }));
  assert.ok("error" in parseSeriesInput({ title: "系列", slug: "", description: "字".repeat(301) }));
  assert.deepEqual(parseSeriesInput({ title: "系列", slug: "---", description: "" }), { error: "网址别名需要包含文字或数字" });
  assert.deepEqual(parseSeriesInput({ title: "!!!", slug: "", description: "" }), { error: "网址别名需要包含文字或数字" });
});

test("position in a series gives the number and neighbours", () => {
  const items = [{ id: 7 }, { id: 3 }, { id: 9 }];
  assert.deepEqual(seriesPosition(items, 3), { number: 2, total: 3, prev: { id: 7 }, next: { id: 9 } });
  assert.deepEqual(seriesPosition(items, 7), { number: 1, total: 3, prev: null, next: { id: 3 } });
  assert.deepEqual(seriesPosition(items, 9)?.next, null);
  assert.equal(seriesPosition(items, 42), null);
});
