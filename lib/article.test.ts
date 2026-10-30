import assert from "node:assert/strict";
import test from "node:test";
import { processArticle } from "./article";

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
  const [first, second] = html.match(/<img[^>]*>/g) ?? [];
  assert.ok(first && !first.includes('loading="lazy"'), first);
  assert.match(first, /fetchpriority="high"/);
  assert.match(second ?? "", /loading="lazy"/);
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
