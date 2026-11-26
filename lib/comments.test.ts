import assert from "node:assert/strict";
import { test } from "node:test";
import {
  cdnFileUrl,
  commentEmbed,
  commentFrameCsp,
  commentFrameHtml,
  defaultComments,
  parseCommentServer,
  parseCommentsInput,
  readComments,
  type CommentsSettings,
} from "./comments";

const input = (patch: Partial<Record<keyof CommentsSettings, string>>) => ({
  provider: "none",
  server: "",
  site: "",
  repo: "",
  repoId: "",
  category: "",
  categoryId: "",
  cdn: "npmmirror",
  ...patch,
});

test("comment servers must be plain https addresses", () => {
  assert.deepEqual(parseCommentServer(" https://c.example.com/ "), { value: "https://c.example.com" });
  assert.deepEqual(parseCommentServer("https://example.com/waline/"), { value: "https://example.com/waline" });
  for (const bad of ["", "c.example.com", "http://c.example.com", "https://u:p@c.example.com", "https://c.example.com/?a=1", "javascript:alert(1)"]) {
    assert.ok("error" in parseCommentServer(bad), bad);
  }
});

test("each provider keeps only the fields it needs and validates them", () => {
  assert.deepEqual(parseCommentsInput(input({})), { data: defaultComments });
  const waline = parseCommentsInput(input({ provider: "waline", server: "https://w.example.com", site: "ignored", repo: "a/b" }));
  assert.ok("data" in waline);
  assert.equal(waline.data.server, "https://w.example.com");
  assert.equal(waline.data.site, "");
  assert.equal(waline.data.repo, "");
  assert.ok("error" in parseCommentsInput(input({ provider: "artalk", server: "https://a.example.com" })), "artalk needs a site name");
  assert.ok("error" in parseCommentsInput(input({ provider: "giscus", repo: "not a repo" })));
  const giscus = parseCommentsInput(
    input({ provider: "giscus", repo: "octocat/comments", repoId: "R_kgDOabc", category: "Announcements", categoryId: "DIC_kwDOxyz" }),
  );
  assert.ok("data" in giscus);
  assert.ok("error" in parseCommentsInput(input({ provider: "giscus", repo: "octocat/comments", repoId: "R_kgDOabc", category: 'a"><script>', categoryId: "DIC_kwDOxyz" })));
  assert.ok("error" in parseCommentsInput(input({ provider: "disqus" })));
});

test("stored settings that no longer validate count as comments off", () => {
  assert.equal(readComments({ provider: "waline", server: "http://insecure.example.com" }).provider, "none");
  assert.equal(readComments(null).provider, "none");
  assert.equal(readComments({ provider: "twikoo", server: "https://t.example.com", cdn: "unpkg" }).cdn, "unpkg");
});

test("client scripts are pinned to a version on the chosen CDN", () => {
  assert.equal(cdnFileUrl("npmmirror", "@waline/client", "3.16.2", "dist/waline.umd.js"), "https://registry.npmmirror.com/@waline/client/3.16.2/files/dist/waline.umd.js");
  assert.equal(cdnFileUrl("unpkg", "twikoo", "2.0.17", "dist/twikoo.all.min.js"), "https://unpkg.com/twikoo@2.0.17/dist/twikoo.all.min.js");
  assert.equal(cdnFileUrl("jsdelivr", "twikoo", "2.0.17", "dist/twikoo.all.min.js"), "https://cdn.jsdelivr.net/npm/twikoo@2.0.17/dist/twikoo.all.min.js");
});

const page = { path: "/tutorials/入门", title: '标题 </script><script>alert(1)</script>' };

test("the comment frame's CSP only allows the chosen provider's scripts", () => {
  const settings = readComments({ provider: "artalk", server: "https://artalk.example.com", site: "站点" });
  const embed = commentEmbed(settings, page, "dark")!;
  assert.equal(embed.script, "https://artalk.example.com/dist/Artalk.js");
  const csp = commentFrameCsp(embed, "abc123abc123abc123==");
  assert.match(csp, /script-src 'nonce-abc123abc123abc123==' https:\/\/artalk\.example\.com(;|$)/);
  assert.match(csp, /frame-ancestors 'self'/);
  assert.match(csp, /frame-src 'none'/);
  assert.doesNotMatch(csp, /unsafe-eval/);
  const giscus = commentEmbed(
    readComments({ provider: "giscus", repo: "octocat/comments", repoId: "R_kgDOabc", category: "Q&A", categoryId: "DIC_kwDOxyz" }),
    page,
    "light",
  )!;
  assert.match(commentFrameCsp(giscus, "abc123abc123abc123=="), /frame-src https:\/\/giscus\.app/);
  assert.equal(giscus.attributes?.["data-term"], "/tutorials/入门");
  assert.equal(commentEmbed(defaultComments, page, "light"), null);
});

test("the comment frame HTML escapes everything it embeds", () => {
  const artalk = commentEmbed(readComments({ provider: "artalk", server: "https://artalk.example.com", site: "站点" }), page, "dark")!;
  const html = commentFrameHtml(artalk, "abc123abc123abc123==", "dark");
  assert.equal(html.match(/<\/script>/g)?.length, 2, "the title cannot close the inline script early");
  assert.match(html, /\\u003c\/script>/);
  assert.match(html, /data-theme="dark"/);
  assert.match(html, /"back":"\/tutorials\/%E5%85%A5%E9%97%A8#comments"/);
  const giscus = commentEmbed(
    readComments({ provider: "giscus", repo: "octocat/comments", repoId: "R_kgDOabc", category: "Q&A", categoryId: "DIC_kwDOxyz" }),
    page,
    "light",
  )!;
  assert.match(commentFrameHtml(giscus, "abc123abc123abc123==", "light"), /data-category="Q&amp;A"/);
});
