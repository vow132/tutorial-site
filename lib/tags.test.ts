import assert from "node:assert/strict";
import { test } from "node:test";
import { normalizeTagName, parseTagNames, tagPath, tagSlug } from "./tags";
import { messagesFor } from "./i18n/messages";

const v = messagesFor("zh-CN").admin.validation;

test("tag slugs are readable, lowercase and keep Chinese", () => {
  assert.equal(tagSlug("C++"), "c-plus-plus");
  assert.equal(tagSlug("C#"), "c-sharp");
  assert.equal(tagSlug("Node.js"), "node-js");
  assert.equal(tagSlug("ＣＳＳ 布局"), "css-布局");
  assert.equal(tagSlug("  --- "), "");
  assert.equal(tagPath("css-布局"), "/tags/css-%E5%B8%83%E5%B1%80");
  assert.equal(normalizeTagName("  #前端   性能 "), "前端 性能");
});

test("tag input is split, de-duplicated by slug and limited", () => {
  assert.deepEqual(parseTagNames("CSS，布局、css; Flexbox\n#布局", v), { names: ["CSS", "布局", "Flexbox"] });
  assert.deepEqual(parseTagNames(" , ，", v), { names: [] });
  assert.match((parseTagNames("一,二,三,四,五,六,七,八,九", v) as { error: string }).error, /最多 8 个/);
  assert.match((parseTagNames("这是一个超过二十四个字的非常非常非常非常长的标签名称啊", v) as { error: string }).error, /太长/);
  assert.match((parseTagNames("!!!", v) as { error: string }).error, /文字或数字/);
});
