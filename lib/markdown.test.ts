import assert from "node:assert/strict";
import { test } from "node:test";
import { tutorialToMarkdown } from "./markdown-export";
import { convertCallouts, markdownToTutorial, parseFrontMatter } from "./markdown-import";

test("front matter supports inline lists, dash lists and quotes", () => {
  const { data, body } = parseFrontMatter('---\ntitle: "部署：从零开始"\ntags:\n  - Nginx\n  - "Docker"\nkeywords: [a, b]\n---\n正文');
  assert.deepEqual(data, { title: "部署：从零开始", tags: ["Nginx", "Docker"], keywords: ["a", "b"] });
  assert.equal(body, "正文");
  assert.deepEqual(parseFrontMatter("没有 front matter").data, {});
});

test("imported Markdown fills the form fields", () => {
  const imported = markdownToTutorial(
    "---\nslug: docker-intro\ndescription: 一篇入门\ntags: Docker, 运维\n---\n\n# Docker 入门\n\n## 安装\n\n```bash\napt install docker.io\n```\n\n> [!TIP]\n> 先 **更新** 软件源\n\n#### 很深的标题\n",
  );
  assert.equal(imported.title, "Docker 入门");
  assert.equal(imported.slug, "docker-intro");
  assert.equal(imported.excerpt, "一篇入门");
  assert.deepEqual(imported.tags, ["Docker", "运维"]);
  assert.match(imported.content, /^<h2>安装<\/h2>/);
  assert.match(imported.content, /<pre><code class="language-bash">apt install docker\.io<\/code><\/pre>/);
  assert.match(imported.content, /<div data-callout="tip">\s*<p>先 <strong>更新<\/strong> 软件源<\/p>\s*<\/div>/);
  assert.match(imported.content, /<p><strong>很深的标题<\/strong><\/p>/);
  assert.doesNotMatch(imported.content, /Docker 入门/);
});

test("top-level # sections become h2 when the title comes from front matter", () => {
  const imported = markdownToTutorial("---\ntitle: T\n---\n# 一\n## 二\n### 三");
  assert.equal(imported.content, "<h2>一</h2>\n<h3>二</h3>\n<p><strong>三</strong></p>");
});

test("callout syntax inside code fences is left alone", () => {
  const source = "```md\n> [!TIP]\n> 示例\n```";
  assert.equal(convertCallouts(source), source);
  assert.match(convertCallouts("> [!CAUTION] 小心\n> 第二行"), /^<div data-callout="danger">\n\n小心\n第二行\n\n<\/div>$/);
});

test("exported Markdown has front matter, GFM tables, callouts and absolute links", () => {
  const markdown = tutorialToMarkdown(
    {
      title: "测试：导出",
      slug: "test-export",
      excerpt: null,
      tags: ["Node.js"],
      content:
        '<p>见<a href="/tutorials/x">这里</a> <s>旧</s></p><ol><li><p>一</p></li><li><p>二</p></li></ol><div data-callout="danger"><p>别删库</p></div><table><tbody><tr><th><p>a</p></th><th><p>b</p></th></tr><tr><td><p>1</p></td><td><p>x | y</p></td></tr></tbody></table><p><img src="/uploads/p.webp" alt="图"></p>',
      createdAt: new Date("2026-11-01T00:00:00Z"),
      updatedAt: new Date("2026-11-02T00:00:00Z"),
    },
    "https://example.com/",
  );
  assert.match(markdown, /^---\ntitle: "测试：导出"\nslug: test-export\ntags: \[Node\.js\]\ndate: 2026-11-01T00:00:00\.000Z\n/);
  assert.match(markdown, /见\[这里\]\(https:\/\/example\.com\/tutorials\/x\) ~~旧~~/);
  assert.match(markdown, /\n1\. 一\n2\. 二\n/);
  assert.match(markdown, /> \[!CAUTION\]\n> 别删库/);
  assert.match(markdown, /\| a \| b \|\n\| --- \| --- \|\n\| 1 \| x \\\| y \|/);
  assert.match(markdown, /!\[图\]\(https:\/\/example\.com\/uploads\/p\.webp\)/);
});

test("export then import keeps the structure", () => {
  const html = '<h2>步骤</h2><pre><code class="language-sql">SELECT 1;</code></pre><div data-callout="warning"><p>先备份</p></div>';
  const markdown = tutorialToMarkdown(
    { title: "往返", slug: "round-trip", excerpt: "摘要", tags: ["SQL"], content: html, createdAt: new Date(0), updatedAt: new Date(0) },
    "https://example.com",
  );
  const back = markdownToTutorial(markdown);
  assert.equal(back.title, "往返");
  assert.equal(back.excerpt, "摘要");
  assert.deepEqual(back.tags, ["SQL"]);
  assert.match(back.content, /<h2>步骤<\/h2>/);
  assert.match(back.content, /<code class="language-sql">SELECT 1;<\/code>/);
  assert.match(back.content, /<div data-callout="warning">\s*<p>先备份<\/p>/);
});
