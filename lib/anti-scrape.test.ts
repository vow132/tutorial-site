import assert from "node:assert/strict";
import { test } from "node:test";
import { AI_TRAINING_CRAWLERS, aiCrawlerRule, copyAttribution, readAntiScrape } from "./anti-scrape";

test("anti-scrape settings default to off and only accept real booleans", () => {
  assert.deepEqual(readAntiScrape(undefined), { blockAiCrawlers: false, copyAttribution: false });
  assert.deepEqual(readAntiScrape({ blockAiCrawlers: true, copyAttribution: "yes" }), { blockAiCrawlers: true, copyAttribution: false });
  assert.deepEqual(readAntiScrape("junk"), { blockAiCrawlers: false, copyAttribution: false });
});

test("the robots.txt rule blocks AI training crawlers only, never search engines or AI search", () => {
  const rule = aiCrawlerRule();
  assert.equal(rule.disallow, "/");
  for (const bot of ["GPTBot", "ClaudeBot", "CCBot", "Google-Extended", "Bytespider", "Meta-ExternalAgent"]) {
    assert.ok(rule.userAgent.includes(bot), bot);
  }
  const lower = AI_TRAINING_CRAWLERS.map((bot) => bot.toLowerCase());
  for (const kept of ["googlebot", "bingbot", "baiduspider", "applebot", "oai-searchbot", "chatgpt-user", "claude-searchbot", "claude-user", "perplexitybot", "facebookexternalhit", "*"]) {
    assert.ok(!lower.includes(kept), `${kept} must not be blocked`);
  }
  assert.equal(new Set(lower).size, lower.length, "no duplicates");
});

test("copied text gets the title and the article link; HTML is escaped", () => {
  const source = copyAttribution('标题 <b>"x"</b> & y', "https://example.com/tutorials/a?b=1&c=2");
  assert.equal(source.text, '\n\n来源：标题 <b>"x"</b> & y https://example.com/tutorials/a?b=1&c=2');
  assert.equal(
    source.html,
    '<p>来源：<a href="https://example.com/tutorials/a?b=1&amp;c=2">标题 &lt;b&gt;&quot;x&quot;&lt;/b&gt; &amp; y</a> https://example.com/tutorials/a?b=1&amp;c=2</p>',
  );
});
