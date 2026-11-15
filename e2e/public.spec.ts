import { expect, test } from "@playwright/test";
import { collectErrors } from "./helpers";

async function firstHref(page: import("@playwright/test").Page, prefix: string) {
  const href = await page.locator(`main a[href^="${prefix}"]`).first().getAttribute("href");
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
