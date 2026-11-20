import { expect, test, type Page } from "@playwright/test";
import { ADMIN_STATE, collectErrors, createTutorialViaForm, deleteTutorialRow, uniqueSuffix } from "./helpers";

test.use({ storageState: ADMIN_STATE });

const seriesItems = (page: Page) => page.locator('section[aria-labelledby="series-items"] ol > li');

async function openSeriesAdmin(page: Page, title: string) {
  await page.goto("/admin/series");
  await page.getByRole("link", { name: title, exact: true }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(title);
}

test("tutorials can be grouped into an ordered series", async ({ page, request }) => {
  const errors = collectErrors(page);
  const id = uniqueSuffix();
  const seriesTitle = `E2E 系列 ${id}`;
  const seriesSlug = `e2e-series-${id}`;
  const first = { title: `E2E 系列甲 ${id}`, slug: `e2e-series-a-${id}` };
  const second = { title: `E2E 系列乙 ${id}`, slug: `e2e-series-b-${id}` };

  try {
    await page.goto("/admin/series");
    await page.getByLabel(/^系列名称/).fill(seriesTitle);
    await page.getByLabel("网址别名").fill(seriesSlug);
    await page.getByLabel(/^简介/).fill("两篇 E2E 教程组成的系列");
    await page.getByRole("button", { name: "创建系列" }).click();
    await expect(page).toHaveURL(/\/admin\/series\/\d+$/);
    // 还没有已发布的教程：前台不存在
    expect((await request.get(`/series/${seriesSlug}`)).status()).toBe(404);

    await createTutorialViaForm(page, { ...first, series: seriesTitle });
    await createTutorialViaForm(page, { ...second, series: seriesTitle });

    // 文章页：系列目录 + 本系列的上一篇
    await page.goto(`/tutorials/${second.slug}`);
    const box = page.getByRole("navigation", { name: "系列目录" });
    await expect(box).toContainText("第 2 / 2 篇");
    await expect(box.getByRole("link", { name: seriesTitle })).toHaveAttribute("href", `/series/${seriesSlug}`);
    await expect(box.locator('[aria-current="page"]')).toHaveText(second.title);
    await expect(page.getByRole("link", { name: new RegExp(`上一篇（本系列）\\s*${first.title}`) })).toHaveCount(1);
    const graph = (await page.locator('script[type="application/ld+json"]').allTextContents()).map((text) => JSON.parse(text));
    expect(JSON.stringify(graph)).toContain(`"isPartOf":{"@type":"CreativeWorkSeries","name":"${seriesTitle}"`);

    // 系列页按顺序列出，两篇以上允许收录
    await page.goto(`/series/${seriesSlug}`);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(seriesTitle);
    const items = page.locator("main ol > li");
    await expect(items).toHaveCount(2);
    await expect(items.first()).toContainText(first.title);
    await expect(page.locator('meta[name="robots"]')).toHaveCount(0);
    await page.goto("/series");
    await expect(page.getByRole("link", { name: new RegExp(seriesTitle) })).toBeVisible();

    // 后台调整顺序：前台跟着变
    await openSeriesAdmin(page, seriesTitle);
    await page.getByRole("button", { name: `上移「${second.title}」` }).click();
    await expect(seriesItems(page).first()).toContainText(second.title);
    await page.goto(`/series/${seriesSlug}`);
    await expect(page.locator("main ol > li").first()).toContainText(second.title);
    await page.goto(`/tutorials/${first.slug}`);
    await expect(page.getByRole("navigation", { name: "系列目录" })).toContainText("第 2 / 2 篇");

    // 移出系列：那篇不再显示系列目录，系列只剩一篇时系列页不让收录
    await openSeriesAdmin(page, seriesTitle);
    page.once("dialog", (dialog) => dialog.accept());
    await seriesItems(page).filter({ hasText: first.title }).getByRole("button", { name: "移出" }).click();
    await expect(seriesItems(page)).toHaveCount(1);
    await page.goto(`/tutorials/${first.slug}`);
    await expect(page.getByRole("navigation", { name: "系列目录" })).toHaveCount(0);
    await page.goto(`/series/${seriesSlug}`);
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);

    // 删除系列：教程保留，系列页 404
    await openSeriesAdmin(page, seriesTitle);
    page.once("dialog", (dialog) => dialog.accept());
    await page.getByRole("button", { name: "删除系列" }).click();
    await expect(page).toHaveURL(/\/admin\/series$/);
    expect((await request.get(`/series/${seriesSlug}`)).status()).toBe(404);
    await page.goto(`/tutorials/${second.slug}`);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(second.title);
    await expect(page.getByRole("navigation", { name: "系列目录" })).toHaveCount(0);
    expect(errors).toEqual([]);
  } finally {
    await deleteTutorialRow(page, first.title);
    await deleteTutorialRow(page, second.title);
    await page.goto("/admin/series");
    const link = page.getByRole("link", { name: seriesTitle, exact: true });
    if (await link.count()) {
      await link.click();
      page.once("dialog", (dialog) => dialog.accept());
      await page.getByRole("button", { name: "删除系列" }).click();
      await page.waitForURL(/\/admin\/series$/);
    }
  }
});

test("series forms reject duplicate slugs and keep what was typed", async ({ page }) => {
  const id = uniqueSuffix();
  const title = `E2E 重名系列 ${id}`;
  await page.goto("/admin/series");
  await page.getByLabel(/^系列名称/).fill(title);
  await page.getByLabel("网址别名").fill(`e2e-dup-${id}`);
  await page.getByRole("button", { name: "创建系列" }).click();
  await expect(page).toHaveURL(/\/admin\/series\/\d+$/);
  try {
    await page.goto("/admin/series");
    await page.getByLabel(/^系列名称/).fill(`${title} 二`);
    await page.getByLabel("网址别名").fill(`e2e-dup-${id}`);
    await page.getByRole("button", { name: "创建系列" }).click();
    await expect(page.getByText("网址别名已被其他系列占用")).toBeVisible();
    await expect(page.getByLabel(/^系列名称/)).toHaveValue(`${title} 二`);
  } finally {
    await openSeriesAdmin(page, title);
    page.once("dialog", (dialog) => dialog.accept());
    await page.getByRole("button", { name: "删除系列" }).click();
    await page.waitForURL(/\/admin\/series$/);
  }
});
