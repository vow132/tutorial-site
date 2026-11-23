import assert from "node:assert/strict";
import { test } from "node:test";
import {
  autoExcerpt,
  convertWikiLinks,
  extractImageSources,
  isImportableMarkdown,
  markdownFileToCandidate,
  nginxRedirectRules,
  normalizeHeadings,
  parseDate,
  parseWordPressExport,
  pathOf,
  replaceImageSources,
  resolveLocalImage,
  tomlFrontMatterToYaml,
  wordpressContentToHtml,
} from "./bulk-import";

test("folder scans skip dependencies, build output, themes and Hugo section pages", () => {
  assert.equal(isImportableMarkdown("blog/source/_posts/hello.md"), true);
  assert.equal(isImportableMarkdown("blog/source/_drafts/wip.markdown"), true);
  assert.equal(isImportableMarkdown("blog/node_modules/pkg/README.md"), false);
  assert.equal(isImportableMarkdown("blog/public/2023/index.md"), false);
  assert.equal(isImportableMarkdown("site/themes/x/archetypes/default.md"), false);
  assert.equal(isImportableMarkdown("site/content/posts/_index.md"), false);
  assert.equal(isImportableMarkdown("vault/.obsidian/notes.md"), false);
  assert.equal(isImportableMarkdown("notes/image.png"), false);
});

test("dates without a timezone are read as Beijing time; nonsense dates are dropped", () => {
  assert.equal(parseDate("2023-01-05 12:30:00"), "2023-01-05T04:30:00.000Z");
  assert.equal(parseDate("2023-1-5"), "2023-01-04T16:00:00.000Z");
  assert.equal(parseDate("2023-01-05T12:30:00Z"), "2023-01-05T12:30:00.000Z");
  assert.equal(parseDate("'2023-01-05'"), "2023-01-04T16:00:00.000Z");
  assert.equal(parseDate("0000-00-00 00:00:00"), null);
  assert.equal(parseDate("not a date"), null);
  assert.equal(parseDate("2999-01-01"), null);
  assert.equal(parseDate(""), null);
});

test("a Hexo post keeps its title, date, tags, categories, draft state and <!-- more --> excerpt", () => {
  const markdown = [
    "---",
    "title: Flex 布局入门",
    "date: 2023-03-01 09:00:00",
    "updated: 2023-04-01 10:00:00",
    "tags: [CSS, 布局]",
    "categories:",
    "- [前端, CSS]",
    "permalink: /2023/03/flex-intro/",
    "---",
    "Flex 是一维布局模型。",
    "",
    "<!-- more -->",
    "",
    "# 主轴",
    "正文内容",
    "#### 小节",
    "![示意图](./images/axis.png)",
  ].join("\n");
  const item = markdownFileToCandidate("blog/source/_posts/flex-intro.md", markdown);
  assert.equal(item.title, "Flex 布局入门");
  assert.equal(item.slug, "flex-intro");
  assert.equal(item.createdAt, "2023-03-01T01:00:00.000Z");
  assert.equal(item.updatedAt, "2023-04-01T02:00:00.000Z");
  assert.deepEqual(item.tags, ["CSS", "布局"]);
  assert.deepEqual(item.categories, ["前端", "CSS"]);
  assert.equal(item.published, true);
  assert.equal(item.excerpt, "Flex 是一维布局模型。");
  assert.equal(item.oldPath, "/2023/03/flex-intro/");
  assert.match(item.content, /<h2>主轴<\/h2>/);
  assert.match(item.content, /<p><strong>小节<\/strong><\/p>/);
  assert.doesNotMatch(item.content, /more/);
  assert.deepEqual(item.images, ["./images/axis.png"]);
});

test("Jekyll file names give the date and slug; Hugo bundles use the folder name; drafts are detected", () => {
  const jekyll = markdownFileToCandidate("_posts/2022-08-09-git-basics.md", "# Git 基础\n\n内容");
  assert.equal(jekyll.slug, "git-basics");
  assert.equal(jekyll.title, "Git 基础");
  assert.equal(jekyll.createdAt, "2022-08-08T16:00:00.000Z");

  const hugo = markdownFileToCandidate("content/posts/docker-intro/index.md", "+++\ntitle = \"Docker 入门\"\ndraft = true\ntags = [\"Docker\", \"运维\"]\n+++\n正文");
  assert.equal(hugo.slug, "docker-intro");
  assert.equal(hugo.title, "Docker 入门");
  assert.equal(hugo.published, false);
  assert.deepEqual(hugo.tags, ["Docker", "运维"]);

  assert.equal(markdownFileToCandidate("source/_drafts/wip.md", "草稿").published, false);
  assert.equal(markdownFileToCandidate("notes/no-title.md", "只有正文").title, "no-title");
  const modified = Date.UTC(2021, 5, 1);
  assert.equal(markdownFileToCandidate("notes/a.md", "x", modified).createdAt, new Date(modified).toISOString());
});

test("TOML front matter and Obsidian wiki links are converted", () => {
  assert.equal(tomlFrontMatterToYaml('+++\ntitle = "A"\n+++\nbody'), '---\ntitle: "A"\n---\nbody');
  assert.equal(tomlFrontMatterToYaml("no front matter"), "no front matter");
  assert.equal(convertWikiLinks("![[my pic.png|图]] 见 [[另一篇笔记|这里]] 和 [[索引]]"), "![图](<my pic.png>) 见 这里 和 索引");
});

test("local images resolve relative to the file, the folder root, Hexo source/ and Hugo static/, then by unique name", () => {
  const files = new Set(["blog/source/_posts/images/axis.png", "blog/source/img/logo.png", "site/static/pics/a.webp", "vault/attachments/my pic.png", "vault/x/dup.png", "vault/y/dup.png"]);
  assert.equal(resolveLocalImage("./images/axis.png", "blog/source/_posts/flex.md", files), "blog/source/_posts/images/axis.png");
  assert.equal(resolveLocalImage("/img/logo.png", "blog/source/_posts/flex.md", files), "blog/source/img/logo.png");
  assert.equal(resolveLocalImage("/pics/a.webp", "site/content/posts/a.md", files), "site/static/pics/a.webp");
  assert.equal(resolveLocalImage("my%20pic.png", "vault/notes/a.md", files), "vault/attachments/my pic.png");
  assert.equal(resolveLocalImage("dup.png", "vault/notes/a.md", files), null, "two files with the same name are ambiguous");
  assert.equal(resolveLocalImage("https://cdn.example.com/a.png", "vault/a.md", files), null);
  assert.equal(resolveLocalImage("data:image/png;base64,xx", "vault/a.md", files), null);
});

test("image sources are found and replaced, and old srcset attributes are dropped", () => {
  const html = '<p><img src="./a.png" alt="a"><img alt="b" src=\'https://old.example/b-1024x768.jpg\' srcset="https://old.example/b-300x200.jpg 300w" sizes="100vw"></p>';
  assert.deepEqual(extractImageSources(html), ["./a.png", "https://old.example/b-1024x768.jpg"]);
  const replaced = replaceImageSources(html, new Map([["./a.png", "/uploads/1-a.webp"], ["https://old.example/b-1024x768.jpg", "/uploads/2-b.webp"]]));
  assert.equal(replaced, '<p><img src="/uploads/1-a.webp" alt="a"><img alt="b" src="/uploads/2-b.webp"></p>');
  assert.equal(replaceImageSources('<img src="keep.png">', new Map()), '<img src="keep.png">');
});

test("headings are mapped onto the editor's two levels", () => {
  assert.equal(normalizeHeadings("<h1>A</h1><h2 id=x>B</h2><h4>C</h4>"), "<h2>A</h2><h3>B</h3><p><strong>C</strong></p>");
  assert.equal(normalizeHeadings("<h3>A</h3><h4>B</h4>"), "<h3>A</h3><p><strong>B</strong></p>");
  assert.equal(normalizeHeadings("<p>no headings</p>"), "<p>no headings</p>");
  assert.equal(autoExcerpt("<p>一二三四五</p><pre>code</pre>", 3), "一二三…");
});

const wxr = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:content="http://purl.org/rss/1.0/modules/content/" xmlns:wp="http://wordpress.org/export/1.2/" xmlns:excerpt="http://wordpress.org/export/1.2/excerpt/">
<channel>
  <title>旧博客</title>
  <link>https://old.example</link>
  <item>
    <title>WordPress 的第一篇 &amp; 测试</title>
    <link>https://old.example/2021/05/hello-%e4%b8%96%e7%95%8c/</link>
    <content:encoded><![CDATA[第一段
第二行

<a href="https://old.example/wp-content/uploads/2021/05/pic.jpg"><img src="https://old.example/wp-content/uploads/2021/05/pic-1024x768.jpg" srcset="x 300w" /></a>

[code lang="js"]if (a < b) console.log("</item>");[/code]

[gallery ids="1,2"]

<h1>大标题</h1>]]></content:encoded>
    <excerpt:encoded><![CDATA[]]></excerpt:encoded>
    <wp:post_id>12</wp:post_id>
    <wp:post_date><![CDATA[2021-05-02 08:00:00]]></wp:post_date>
    <wp:post_date_gmt><![CDATA[2021-05-02 00:00:00]]></wp:post_date_gmt>
    <wp:post_modified_gmt><![CDATA[2021-06-01 00:00:00]]></wp:post_modified_gmt>
    <wp:post_name><![CDATA[hello-%e4%b8%96%e7%95%8c]]></wp:post_name>
    <wp:status><![CDATA[publish]]></wp:status>
    <wp:post_type><![CDATA[post]]></wp:post_type>
    <category domain="category" nicename="frontend"><![CDATA[前端开发]]></category>
    <category domain="category" nicename="uncategorized"><![CDATA[Uncategorized]]></category>
    <category domain="post_tag" nicename="js"><![CDATA[JavaScript]]></category>
  </item>
  <item>
    <title>关于</title>
    <wp:post_id>2</wp:post_id>
    <wp:status><![CDATA[publish]]></wp:status>
    <wp:post_type><![CDATA[page]]></wp:post_type>
  </item>
  <item>
    <title>草稿</title>
    <content:encoded><![CDATA[<!-- wp:paragraph --><p>块编辑器</p><!-- /wp:paragraph -->]]></content:encoded>
    <wp:post_id>13</wp:post_id>
    <wp:post_date_gmt><![CDATA[0000-00-00 00:00:00]]></wp:post_date_gmt>
    <wp:post_date><![CDATA[2021-07-01 10:00:00]]></wp:post_date>
    <wp:post_name><![CDATA[]]></wp:post_name>
    <wp:status><![CDATA[draft]]></wp:status>
    <wp:post_type><![CDATA[post]]></wp:post_type>
  </item>
  <item>
    <title>回收站</title>
    <wp:post_id>14</wp:post_id>
    <wp:status><![CDATA[trash]]></wp:status>
    <wp:post_type><![CDATA[post]]></wp:post_type>
  </item>
</channel>
</rss>`;

test("a WordPress export yields posts with their state, dates, terms and cleaned content", () => {
  const { siteUrl, items, skipped } = parseWordPressExport(wxr);
  assert.equal(siteUrl, "https://old.example");
  assert.deepEqual(skipped, ["页面「关于」"]);
  assert.equal(items.length, 2);

  const [post, draft] = items;
  assert.equal(post.title, "WordPress 的第一篇 & 测试");
  assert.equal(post.slug, "hello-世界");
  assert.equal(post.published, true);
  assert.equal(post.createdAt, "2021-05-02T00:00:00.000Z");
  assert.equal(post.updatedAt, "2021-06-01T00:00:00.000Z");
  assert.deepEqual(post.categories, ["前端开发"]);
  assert.deepEqual(post.tags, ["JavaScript"]);
  assert.equal(post.oldPath, "/2021/05/hello-世界/");
  assert.match(post.content, /^<p>第一段<br>第二行<\/p>/);
  assert.match(post.content, /<pre><code class="language-js">if \(a &lt; b\) console\.log\("&lt;\/item&gt;"\);<\/code><\/pre>/);
  assert.doesNotMatch(post.content, /gallery|<a\b/);
  assert.match(post.content, /<h2>大标题<\/h2>/);
  assert.deepEqual(post.images, ["https://old.example/wp-content/uploads/2021/05/pic-1024x768.jpg"]);
  // 没有摘要时取正文开头（代码块不算）
  assert.equal(post.excerpt, "第一段 第二行 大标题");

  assert.equal(draft.published, false);
  assert.equal(draft.slug, "");
  assert.equal(draft.createdAt, "2021-07-01T02:00:00.000Z");
  assert.equal(draft.content, "<p>块编辑器</p>");
});

test("classic-editor content gets paragraphs; block-editor content is left alone", () => {
  assert.equal(wordpressContentToHtml("一\n\n二\n三"), "<p>一</p>\n<p>二<br>三</p>");
  assert.equal(wordpressContentToHtml("<p>已有段落</p>\n\n文字"), "<p>已有段落</p>\n\n文字");
  assert.equal(wordpressContentToHtml('[caption id="x"]<img src="a.jpg"> 说明[/caption]'), '<img src="a.jpg">\n\n<p>说明</p>');
});

test("redirect rules cover both trailing-slash forms and skip unknown or unsafe paths", () => {
  assert.equal(pathOf("https://old.example/2021/05/hello-%e4%b8%96%e7%95%8c/"), "/2021/05/hello-世界/");
  assert.equal(pathOf("https://old.example/?p=12"), null);
  assert.equal(pathOf("https://old.example/"), null);
  const rules = nginxRedirectRules([
    { oldPath: "/2021/05/hello-世界/", slug: "hello-世界" },
    { oldPath: null, slug: "x" },
    { oldPath: '/bad"path', slug: "y" },
    { oldPath: "/tutorials/same", slug: "same" },
  ]);
  assert.equal(
    rules,
    [
      `location = "/2021/05/hello-世界" { return 301 /tutorials/hello-%E4%B8%96%E7%95%8C; }`,
      `location = "/2021/05/hello-世界/" { return 301 /tutorials/hello-%E4%B8%96%E7%95%8C; }`,
    ].join("\n"),
  );
});
