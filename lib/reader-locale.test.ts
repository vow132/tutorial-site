import assert from "node:assert/strict";
import test from "node:test";
import {
  DEFAULT_SEGMENT,
  isReaderPage,
  READER_SEGMENTS,
  readerCookieAssignment,
  readerRewritePath,
  readerSegment,
  segmentLocale,
  stripReaderSegment,
} from "./i18n/reader";

test("public pages are rewritten by reader language; admin, APIs and generated files are not", () => {
  for (const path of ["/", "/tutorials", "/tutorials/css-grid", "/categories/a/b", "/tags", "/series/x", "/search", "/about", "/subscribe/confirm", "/no-such-page", "/en/tutorials"]) {
    assert.equal(isReaderPage(path), true, path);
  }
  for (const path of [
    "/admin",
    "/admin/tutorials",
    "/api/views",
    "/_next/static/chunk.js",
    "/uploads/a.webp",
    "/og/site",
    "/og/tutorials/1",
    "/brand/icon",
    "/comments/frame",
    "/.well-known/security.txt",
    "/favicon.ico",
    "/feed.xml",
    "/sitemap.xml",
    "/robots.txt",
    "/manifest.webmanifest",
    "/__nextjs_original-stack-frame",
  ]) {
    assert.equal(isReaderPage(path), false, path);
  }
  // 只排除整段匹配的前缀，不误伤以这些词开头的前台地址
  assert.equal(isReaderPage("/uploads-guide"), true);
  assert.equal(isReaderPage("/feed.xml.bak"), true);
});

test("the cookie picks the segment; anything unknown falls back to the site language", () => {
  assert.equal(readerSegment("en"), "en");
  assert.equal(readerSegment("zh-CN"), "zh-CN");
  for (const value of [undefined, null, "", "fr", "EN", "default", "../admin"]) assert.equal(readerSegment(value), DEFAULT_SEGMENT, String(value));
  assert.equal(segmentLocale("ja"), "ja");
  assert.equal(segmentLocale(DEFAULT_SEGMENT), null);
  assert.equal(segmentLocale(undefined), null);
  assert.deepEqual([...READER_SEGMENTS], ["default", "zh-CN", "en", "ru", "ja"]);
});

test("rewrite paths and stripping are inverse, and real paths are left alone", () => {
  for (const segment of READER_SEGMENTS) {
    for (const path of ["/", "/tutorials", "/tutorials/中文-slug", "/tags/c-plus-plus"]) {
      assert.equal(stripReaderSegment(readerRewritePath(segment, path)), path, `${segment} ${path}`);
    }
  }
  assert.equal(readerRewritePath("en", "/"), "/en");
  assert.equal(stripReaderSegment("/tutorials/en"), "/tutorials/en");
  assert.equal(stripReaderSegment("/english"), "/english");
});

test("choosing the site language clears the cookie, other languages are kept for a year", () => {
  assert.equal(readerCookieAssignment("en", "zh-CN", false), "reader_locale=en; Path=/; SameSite=Lax; Max-Age=31536000");
  assert.equal(readerCookieAssignment("zh-CN", "zh-CN", true), "reader_locale=; Path=/; SameSite=Lax; Max-Age=0; Secure");
});
