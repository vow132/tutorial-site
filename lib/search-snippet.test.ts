import assert from "node:assert/strict";
import { test } from "node:test";
import { htmlFragmentToText, snippetAround, snippetShowsKeyword } from "./search-snippet";

test("fragments cut from the middle of HTML lose their broken tags", () => {
  assert.equal(htmlFragmentToText('ss="x">开启 <strong>浏览器缓存</strong> 之后</p><p>再刷新<a hr'), "开启 浏览器缓存 之后 再刷新");
  assert.equal(htmlFragmentToText("纯文本 &amp; 实体"), "纯文本 & 实体");
});

test("the snippet is centred on the keyword with ellipses where text was cut", () => {
  const text = `${"前".repeat(80)}关键词${"后".repeat(150)}`;
  const snippet = snippetAround(text, "关键词")!;
  assert.ok(snippet.startsWith("…") && snippet.endsWith("…"));
  assert.ok(snippet.includes("关键词"));
  assert.equal(snippet.length, 1 + 40 + 3 + 100 + 1);
  assert.equal(snippetAround("短文里的 Cache 用法", "cache"), "短文里的 Cache 用法");
  assert.equal(snippetAround("短文里的 Cache 用法", "cache", { openStart: true, openEnd: true }), "…短文里的 Cache 用法…");
  assert.equal(snippetAround("没有这个词", "缓存"), null);
  assert.equal(snippetAround("任何文字", "  "), null);
});

test("snippets that already show the keyword are kept", () => {
  assert.equal(snippetShowsKeyword("介绍 Redis 缓存", "redis"), true);
  assert.equal(snippetShowsKeyword("介绍 Redis 缓存", "指纹"), false);
});
