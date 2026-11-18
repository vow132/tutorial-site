import assert from "node:assert/strict";
import { test } from "node:test";
import { keepDrawable, shareImagePath, shareImageVersion, titleLayout } from "./share-image";

const card = { title: "CSS Flexbox 布局完全指南", categoryName: "前端开发", categoryColor: "#6366f1", siteName: "教程网", logoText: "教" };

test("the share image URL changes whenever what is drawn changes", () => {
  assert.match(shareImagePath(7, card), /^\/og\/tutorials\/7\?v=[\w-]{12}$/);
  assert.equal(shareImageVersion(card), shareImageVersion({ ...card }));
  for (const change of [{ title: "新标题" }, { categoryName: "后端" }, { categoryColor: "#000000" }, { siteName: "x" }, { logoText: "x" }]) {
    assert.notEqual(shareImageVersion({ ...card, ...change }), shareImageVersion(card));
  }
});

test("only characters the font has are drawn", () => {
  const covered = new Set(Array.from("Hi 你好！").map((char) => char.codePointAt(0)!));
  assert.equal(keepDrawable("Hi 😀 你好𠀀！\n", covered), "Hi 你好！");
  assert.equal(keepDrawable("你好 😀！", covered), "你好！");
});

test("long titles shrink, then truncate to three lines", () => {
  assert.equal(titleLayout("短标题").fontSize, 76);
  assert.equal(titleLayout("CSS Flexbox 布局完全指南").fontSize, 76); // 约 12.6 个汉字宽，一行放得下
  assert.equal(titleLayout("Node.js 读写文件的三种姿势：回调、Promise 与流").fontSize, 64);
  assert.equal(titleLayout("从零开始搭建一个支持多语言、深色模式、离线缓存和自动化部署的现代化前端工程模板的完整实践记录").text.endsWith("…"), false);
  const long = titleLayout("从零开始搭建一个支持多语言、深色模式、离线缓存和自动化部署的现代化前端工程模板的完整实践记录与踩坑总结（附全部源码与配置文件说明）");
  assert.equal(long.fontSize, 54);
  assert.ok(long.text.endsWith("…"));
  assert.ok(Array.from(long.text).length <= 54);
});
