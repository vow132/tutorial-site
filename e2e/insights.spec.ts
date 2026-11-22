import { expect, test } from "@playwright/test";
import { ADMIN_STATE, collectErrors, createTutorialViaForm, deleteTutorialRow, uniqueSuffix } from "./helpers";

/** 普通浏览器的 UA：Playwright 自带的 HeadlessChrome 会被当作爬虫，不计阅读量。 */
const DESKTOP_UA =
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36";

test.describe("admin", () => {
  test.use({ storageState: ADMIN_STATE });

  test("views are counted per day and show up on the dashboard", async ({ page, browser }) => {
    const errors = collectErrors(page);
    const id = uniqueSuffix();
    const title = `E2E 热门 ${id}`;
    const slug = `e2e-popular-${id}`;
    try {
      await createTutorialViaForm(page, { title, slug });
      const reader = await browser.newContext({ userAgent: DESKTOP_UA });
      const readerPage = await reader.newPage();
      const beacon = readerPage.waitForResponse((res) => res.url().endsWith("/api/views"));
      await readerPage.goto(`/tutorials/${slug}`);
      expect((await beacon).status()).toBe(204);
      await reader.close();

      // 计数每 2 秒批量写一次库
      const top = page.locator('section[aria-labelledby="top-heading"]');
      await expect
        .poll(async () => {
          await page.goto("/admin");
          return top.textContent();
        }, { timeout: 15_000, intervals: [1000] })
        .toContain(title);
      await expect(page.getByRole("heading", { name: "近 30 天阅读", exact: true })).toBeVisible();
      const chart = page.getByRole("group", { name: /每日阅读量折线图/ });
      await expect(chart).toBeVisible();
      // 键盘也能逐日查看
      await chart.focus();
      await page.keyboard.press("ArrowLeft");
      await expect(chart.locator("p[aria-live]")).toContainText("次阅读");
      await page.getByText("查看每日数据").click();
      await expect(page.getByRole("table").filter({ hasText: "阅读量" }).getByRole("row")).toHaveCount(31);
      expect(errors).toEqual([]);
    } finally {
      await deleteTutorialRow(page, title);
    }
  });

  test("the tutorial list can be searched and filtered by status", async ({ page }) => {
    const id = uniqueSuffix();
    const live = `E2E 筛选甲 ${id}`;
    const draft = `E2E 筛选乙 ${id}`;
    try {
      await createTutorialViaForm(page, { title: live, slug: `e2e-filter-a-${id}` });
      await createTutorialViaForm(page, { title: draft, slug: `e2e-filter-b-${id}`, draft: true });

      await page.goto(`/admin/tutorials?q=${id}`);
      await expect(page.getByRole("row").filter({ hasText: id })).toHaveCount(2);
      await expect(page.getByText(/筛选出 2 篇/)).toBeVisible();

      await page.getByLabel("按状态筛选").selectOption("draft");
      await page.getByRole("button", { name: "筛选" }).click();
      await expect(page).toHaveURL(/status=draft/);
      await expect(page.getByRole("row").filter({ hasText: id })).toHaveCount(1);
      await expect(page.getByRole("row").filter({ hasText: draft })).toHaveCount(1);
      await expect(page.getByLabel("搜索标题或 Slug")).toHaveValue(id);

      await page.getByRole("link", { name: "清除筛选" }).click();
      await expect(page).toHaveURL(/\/admin\/tutorials$/);
      await page.goto(`/admin/tutorials?q=${encodeURIComponent("不存在的标题-" + id)}`);
      await expect(page.getByText("没有符合条件的教程")).toBeVisible();
    } finally {
      await deleteTutorialRow(page, live);
      await deleteTutorialRow(page, draft);
    }
  });

  test("readers can say whether a tutorial helped, once per browser", async ({ page, browser }) => {
    const id = uniqueSuffix();
    const title = `E2E 反馈 ${id}`;
    const slug = `e2e-helpful-${id}`;
    try {
      await createTutorialViaForm(page, { title, slug });
      const reader = await browser.newContext();
      const readerPage = await reader.newPage();
      const errors = collectErrors(readerPage);
      await readerPage.goto(`/tutorials/${slug}`);
      const section = readerPage.locator("section.helpful-feedback");
      await expect(section.getByRole("heading")).toHaveText("这篇教程对你有帮助吗？");
      const sent = readerPage.waitForResponse((res) => res.url().endsWith("/api/feedback"));
      await section.getByRole("button", { name: "有帮助" }).click();
      expect((await sent).status()).toBe(204);
      await expect(section.getByRole("status")).toHaveText("谢谢你的反馈！");

      // 再打开：记得投过，按钮不能再点
      await readerPage.reload();
      await expect(section.getByRole("button", { name: "有帮助" })).toHaveAttribute("aria-pressed", "true");
      await expect(section.getByRole("button", { name: "没帮助" })).toBeDisabled();
      expect(errors).toEqual([]);
      await reader.close();

      await page.goto(`/admin/tutorials?q=${id}`);
      await expect(page.getByRole("row").filter({ hasText: title })).toContainText("👍 1 · 👎 0");
    } finally {
      await deleteTutorialRow(page, title);
    }
  });

  test("search results show the passage where a body-only keyword appears", async ({ page }) => {
    const id = uniqueSuffix();
    const title = `E2E 摘要 ${id}`;
    const slug = `e2e-snippet-${id}`;
    const keyword = `独门诀窍${id}`;
    try {
      await createTutorialViaForm(page, {
        title,
        slug,
        body: `${"这是一段很长的铺垫文字，".repeat(30)}真正要找的是${keyword}，它藏在正文中间。${"后面还有更多说明。".repeat(20)}`,
      });
      await page.goto(`/search?q=${encodeURIComponent(keyword)}`);
      const result = page.locator(`a[href="/tutorials/${slug}"]`);
      await expect(result).toContainText(keyword);
      await expect(result.locator("p").last()).toHaveText(/^….*真正要找的是.*…$/);
      await expect(result.locator("mark")).toContainText(keyword);
    } finally {
      await deleteTutorialRow(page, title);
    }
  });
});

test("long articles get a reading progress bar and a back-to-top button", async ({ page }) => {
  const errors = collectErrors(page);
  await page.setViewportSize({ width: 1280, height: 480 });
  await page.goto("/tutorials");
  const href = await page.locator('main a[href^="/tutorials/"]').first().getAttribute("href");
  await page.goto(href!);
  const button = page.locator(".back-to-top");
  const bar = page.locator(".reading-progress");
  await expect(button).toHaveAttribute("inert", "");
  await expect(bar).toHaveAttribute("style", /scaleX\(0\)/);

  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  await expect(button).not.toHaveAttribute("inert");
  await expect(bar).toHaveAttribute("style", /scaleX\(1\)/);

  await button.click();
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);
  await expect(page.locator("#main")).toBeFocused();
  await expect(button).toHaveAttribute("inert", "");
  expect(errors).toEqual([]);
});

test("the feedback endpoint rejects cross-site and malformed votes", async ({ request }) => {
  const crossSite = await request.post("/api/feedback", {
    headers: { "sec-fetch-site": "cross-site" },
    data: { id: 1, helpful: true },
  });
  expect(crossSite.status()).toBe(403);
  expect((await request.post("/api/feedback", { data: { id: 1, helpful: "yes" } })).status()).toBe(400);
  expect((await request.post("/api/feedback", { data: { id: -1, helpful: true } })).status()).toBe(400);
});
