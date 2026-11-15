import assert from "node:assert/strict";
import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import sharp from "sharp";
import { firstArticleImage, htmlToDescription, processArticle, stripHtml } from "./article";

test("TOC text decodes HTML entities so React renders them once", async () => {
  const { toc, html } = await processArticle(
    '<h2>Q&amp;A：&lt;div&gt; 与 "引号" &#39;单&#39;</h2><h3><code>a &amp;&amp; b</code></h3>',
  );
  assert.deepEqual(
    toc.map((item) => item.text),
    [`Q&A：<div> 与 "引号" '单'`, "a && b"],
  );
  // The article body itself must stay escaped.
  assert.match(html, /Q&amp;A：&lt;div&gt;/);
});

test("only images after the first one are lazy-loaded", async () => {
  const { html } = await processArticle(
    '<p><img src="https://example.com/a.png" alt="a"></p><p>正文</p><p><img src="https://example.com/b.png" alt="b"></p>',
  );
  const images = html.match(/<img[^>]*>/g) ?? [];
  assert.equal(images.length, 2);
  const [first, second] = images;
  assert.doesNotMatch(first, /loading="lazy"/);
  assert.match(first, /fetchpriority="high"/);
  assert.match(second, /loading="lazy"/);
});

test("a first image far into the article is not prioritised", async () => {
  const filler = `<p>${"字".repeat(3000)}</p>`;
  const { html } = await processArticle(`${filler}<p><img src="https://example.com/a.png" alt="a"></p>`);
  assert.doesNotMatch(html, /fetchpriority/);
  assert.doesNotMatch(html, /loading="lazy"/);
});

test("malformed numeric entities never break rendering", async () => {
  const { toc } = await processArticle("<h2>A &#99999999; &#x110000; B</h2>");
  assert.equal(toc.length, 1);
  assert.match(toc[0].text, /^A .* B$/);
});

test("plain-text excerpts decode entities so they are escaped only once", () => {
  assert.equal(stripHtml("<p>Q&amp;A：&lt;div&gt; 与&nbsp;flex</p>"), "Q&A：<div> 与 flex");
  assert.equal(stripHtml("<p>一二三四五</p>", 3), "一二三…");
  assert.equal(stripHtml("<h2>标题</h2><p>用 <code>flex</code> 布局</p>"), "标题 用 flex 布局");
});

test("descriptions skip code blocks and fall back to empty for image-only bodies", () => {
  assert.equal(
    htmlToDescription("<pre><code>npm i</code></pre><p>正文<strong>开头</strong></p>"),
    "正文开头",
  );
  assert.equal(htmlToDescription('<p><img src="/uploads/a.webp" alt=""></p>'), "");
});

test("the first article image is used for share cards", () => {
  assert.deepEqual(
    firstArticleImage(
      '<p>x</p><img width="800" height="450" src="/uploads/a.webp" alt="布局 &amp; 对齐"><img src="/uploads/b.webp">',
    ),
    { url: "/uploads/a.webp", alt: "布局 & 对齐", width: 800, height: 450 },
  );
  assert.deepEqual(firstArticleImage('<img src="https://cdn.example.com/a.png?x=1&amp;y=2">'), {
    url: "https://cdn.example.com/a.png?x=1&y=2",
    alt: undefined,
  });
  assert.equal(firstArticleImage("<p>没有图片</p>"), null);
  assert.equal(firstArticleImage('<img src="data:image/png;base64,AAAA">'), null);
  assert.equal(firstArticleImage('<img src="//evil.example/a.png">'), null);
});

test("uploaded images with responsive variants get srcset and sizes", async (t) => {
  const dir = path.join(process.cwd(), "public", "uploads");
  const name = `test-${Date.now()}-${process.pid}`;
  const files = [`${name}.webp`, `${name}-800w.webp`, `${name}-1200w.webp`, `${name}-plain.webp`];
  await mkdir(dir, { recursive: true });
  t.after(() => Promise.all(files.map((file) => rm(path.join(dir, file), { force: true }))));
  const image = (width: number) =>
    sharp({ create: { width, height: Math.round(width / 2), channels: 3, background: "#123456" } })
      .webp()
      .toBuffer();
  await writeFile(path.join(dir, files[0]), await image(1600));
  await writeFile(path.join(dir, files[1]), await image(800));
  await writeFile(path.join(dir, files[2]), await image(1200));
  await writeFile(path.join(dir, files[3]), await image(1600));

  const { html } = await processArticle(
    `<p><img src="/uploads/${files[0]}" alt="a"></p><p><img src="/uploads/${files[3]}" alt="b"></p>`,
  );
  const images = html.match(/<img[^>]*>/g) ?? [];
  assert.equal(images.length, 2);
  const [withVariants, plain] = images as [string, string];
  assert.match(
    withVariants,
    new RegExp(`srcset="/uploads/${name}-800w\\.webp 800w, /uploads/${name}-1200w\\.webp 1200w, /uploads/${name}\\.webp 1600w"`),
  );
  assert.match(withVariants, /sizes="\(min-width: 1280px\) 820px/);
  assert.match(withVariants, /width="1600" height="800"/);
  assert.doesNotMatch(plain, /srcset/);
});
