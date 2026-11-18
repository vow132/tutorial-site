import assert from "node:assert/strict";
import { test } from "node:test";
import { bigramMatchQuery, searchTerms } from "./search-index";

test("Chinese runs become overlapping pairs; other text is kept as words", () => {
  assert.equal(searchTerms("带指纹的 JS 文件"), "带指 指纹 纹的 js 文件");
  assert.equal(searchTerms("用 Flexbox 布局"), "用 flexbox 布局");
  assert.equal(searchTerms("Ｃａｃｈｅ缓存！"), "cache 缓存 !");
});

test("short queries map onto the pair index", () => {
  assert.equal(bigramMatchQuery("指纹"), '"指纹"');
  assert.equal(bigramMatchQuery("指"), '"指"*');
  assert.equal(bigramMatchQuery("JS"), '"js"');
  assert.equal(bigramMatchQuery("c"), null);
  assert.equal(bigramMatchQuery("《》"), null);
});
