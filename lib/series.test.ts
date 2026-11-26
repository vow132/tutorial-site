import assert from "node:assert/strict";
import { test } from "node:test";
import { parseSeriesInput, seriesPath, seriesPosition, groupByChapter, parseChapterInput, firstUnread } from "./series";

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

test("chapters group neighbouring tutorials with the same chapter name, numbering runs through the series", () => {
  const groups = groupByChapter([
    { id: 1, seriesChapter: "准备" },
    { id: 2, seriesChapter: " 准备 " },
    { id: 3, seriesChapter: null },
    { id: 4, seriesChapter: "进阶" },
    { id: 5, seriesChapter: "进阶" },
    { id: 6, seriesChapter: "准备" },
  ]);
  assert.deepEqual(
    groups.map((group) => [group.chapter, group.items.map((item) => item.number)]),
    [
      ["准备", [1, 2]],
      [null, [3]],
      ["进阶", [4, 5]],
      ["准备", [6]],
    ],
  );
  assert.deepEqual(groupByChapter([]), []);
});

test("chapter names are optional and short", () => {
  assert.deepEqual(parseChapterInput("  第一部分  基础 "), { value: "第一部分 基础" });
  assert.deepEqual(parseChapterInput(""), { value: null });
  assert.deepEqual(parseChapterInput(null), { value: null });
  assert.ok("error" in parseChapterInput("长".repeat(31)));
});

test("continue reading points at the first tutorial not read yet", () => {
  const list = [{ id: 1 }, { id: 2 }, { id: 3 }];
  assert.equal(firstUnread(list, new Set())?.id, 1);
  assert.equal(firstUnread(list, new Set([1, 3]))?.id, 2);
  assert.equal(firstUnread(list, new Set([1, 2, 3])), null);
});
