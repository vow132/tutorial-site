import { expect, test } from "@playwright/test";
import sharp from "sharp";
import { collectErrors } from "./helpers";

/**
 * 页面里第一个指向 prefix 的链接。跳过其他测试建的 e2e- 教程：列表是 ISR 缓存页，那些测试刚删掉的教程
 * 可能还留在缓存的列表里（第一次访问拿到旧页面、后台再刷新），点进去就是 404。
 */
async function firstHref(page: import("@playwright/test").Page, prefix: string) {
  const href = await page.locator(`main a[href^="${prefix}"]:not([href*="e2e-"])`).first().getAttribute("href");
  expect(href, `a link starting with ${prefix}`).toBeTruthy();
  return href!;
}

test("public pages render without script errors or CSP violations", async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto("/tutorials");
  const article = await firstHref(page, "/tutorials/");
  await page.goto("/");
  const category = await firstHref(page, "/categories/");

  for (const path of ["/", "/tutorials", article, category, "/search?q=Flexbox"]) {
    const response = await page.goto(path);
    expect(response?.status(), path).toBe(200);
    await expect(page.locator("h1").first()).toBeVisible();
  }
  expect(errors).toEqual([]);
});

test("missing pages return a real 404", async ({ request }) => {
  expect((await request.get("/tutorials/e2e-missing-page")).status()).toBe(404);
  expect((await request.get("/categories/e2e-missing-page")).status()).toBe(404);
});

test("article pages carry canonical, article OpenGraph and JSON-LD", async ({ page }) => {
  await page.goto("/tutorials");
  const article = await firstHref(page, "/tutorials/");
  await page.goto(article);

  const canonical = await page.locator('link[rel="canonical"]').getAttribute("href");
  expect(decodeURIComponent(new URL(canonical!).pathname)).toBe(decodeURIComponent(article));
  await expect(page.locator('meta[property="og:type"]')).toHaveAttribute("content", "article");
  await expect(page.locator('meta[property="article:published_time"]')).toHaveCount(1);
  await expect(page.locator('link[rel="alternate"][type="application/rss+xml"]')).toHaveCount(1);

  const blocks = await page.locator('script[type="application/ld+json"]').allTextContents();
  const types = blocks.flatMap((text) => {
    const data = JSON.parse(text);
    return (data["@graph"] ?? [data]).map((item: { "@type": string }) => item["@type"]);
  });
  expect(types).toEqual(expect.arrayContaining(["Article", "BreadcrumbList"]));
});

test("search is noindex and left out of the sitemap", async ({ page, request }) => {
  await page.goto("/search?q=Flexbox");
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);
  const sitemap = await (await request.get("/sitemap.xml")).text();
  expect(sitemap).toContain("/tutorials/");
  expect(sitemap).not.toContain("/search");
  const robots = await (await request.get("/robots.txt")).text();
  expect(robots).toContain("Disallow: /admin");
});

test("article pages are served from the ISR cache and count views from the browser", async ({ page, request }) => {
  await page.goto("/tutorials");
  const article = await firstHref(page, "/tutorials/");

  await request.get(article);
  const cached = await request.get(article);
  expect(cached.headers()["x-nextjs-cache"]).toBe("HIT");

  const beacon = page.waitForResponse((res) => res.url().endsWith("/api/views"));
  await page.goto(article);
  expect((await beacon).status()).toBe(204);
});

test("the view beacon rejects cross-site and malformed requests", async ({ request }) => {
  const crossSite = await request.post("/api/views", {
    headers: { "sec-fetch-site": "cross-site" },
    data: { id: 1 },
  });
  expect(crossSite.status()).toBe(403);
  expect((await request.post("/api/views", { data: { id: "x" } })).status()).toBe(400);
});

test("articles without a cover get a generated 1200×630 share image", async ({ page, request }) => {
  await page.goto("/tutorials/css-flexbox-guide");
  const content = (await page.locator('meta[property="og:image"]').getAttribute("content"))!;
  expect(content).toMatch(/\/og\/tutorials\/\d+\?v=[\w-]+$/);
  await expect(page.locator('meta[name="twitter:image"]')).toHaveAttribute("content", content);

  const url = new URL(content);
  const image = await request.get(url.pathname + url.search);
  expect(image.status()).toBe(200);
  expect(image.headers()["content-type"]).toBe("image/png");
  expect(image.headers()["cache-control"]).toContain("immutable");
  const meta = await sharp(await image.body()).metadata();
  expect([meta.width, meta.height]).toEqual([1200, 630]);

  // 旧版本号只短期缓存；不存在或未发布的文章 404
  const stale = await request.get(`${url.pathname}?v=old`);
  expect(stale.headers()["cache-control"]).toBe("public, max-age=300");
  expect((await request.get("/og/tutorials/999999")).status()).toBe(404);
});

test("two-character Chinese words and tag names find articles", async ({ page }) => {
  // 「指纹」只出现在示例文章《五分钟理解 HTTP 缓存》的正文里
  await page.goto(`/search?q=${encodeURIComponent("指纹")}`);
  await expect(page.locator('main a[href="/tutorials/http-cache-in-5-min"]').first()).toBeVisible();
  // 「前端基础」是示例标签
  await page.goto(`/search?q=${encodeURIComponent("前端基础")}`);
  await expect(page.locator('main a[href="/tutorials/css-flexbox-guide"]').first()).toBeVisible();
  await expect(page.locator('main a[href="/tutorials/http-cache-in-5-min"]').first()).toBeVisible();
});

test("the health check reports status and the internal publish hook is hidden", async ({ request }) => {
  const health = await request.get("/api/health");
  expect(health.status()).toBe(200);
  expect(health.headers()["cache-control"]).toBe("no-store");
  expect(await health.json()).toEqual({ status: "ok", database: "ok" });
  expect((await request.post("/api/internal/publish-due")).status()).toBe(404);
  expect((await request.post("/api/internal/publish-due", { headers: { "x-scheduler-token": "guess" } })).status()).toBe(404);
});
