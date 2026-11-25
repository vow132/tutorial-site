import { expect, test } from "@playwright/test";

const KEY = "tutorial-site-theme";

test.describe("the theme follows the system until the reader picks one", () => {
  test.use({ colorScheme: "dark" });

  test("dark system → dark site; a manual choice sticks; toggling back to the system's choice follows the system again", async ({ page }) => {
    const html = page.locator("html");
    const toggle = page.locator("[data-theme-toggle]:visible").first();
    const stored = () => page.evaluate((key) => localStorage.getItem(key), KEY);

    await page.goto("/");
    await expect(html).toHaveAttribute("data-theme", "dark");
    expect(await stored()).toBeNull();

    // 手动切到浅色：记住，刷新后还是浅色，系统再变也不跟
    await toggle.click();
    await expect(html).toHaveAttribute("data-theme", "light");
    expect(await stored()).toBe("light");
    await page.reload();
    await expect(html).toHaveAttribute("data-theme", "light");

    // 切回和系统一致的深色：清掉记录，之后跟随系统
    await toggle.click();
    await expect(html).toHaveAttribute("data-theme", "dark");
    expect(await stored()).toBeNull();
    await page.emulateMedia({ colorScheme: "light" });
    await expect(html).toHaveAttribute("data-theme", "light");
    await page.emulateMedia({ colorScheme: "dark" });
    await expect(html).toHaveAttribute("data-theme", "dark");
    await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute("content", "#0d1117");
  });

  test("404 pages of missing tutorials and tags follow the theme too, and the toggle works there", async ({ page }) => {
    // 这类 404 由页面里的 notFound() 触发，Next 只输出空壳、整页在浏览器里渲染（components/theme-boot.tsx 补执行主题脚本）
    const html = page.locator("html");
    const response = await page.goto(`/tutorials/e2e-missing-${Date.now()}`);
    expect(response?.status()).toBe(404);
    await expect(page.getByRole("heading", { name: "404" })).toBeVisible();
    await expect(html).toHaveAttribute("data-theme", "dark");
    await page.locator("[data-theme-toggle]:visible").first().click();
    await expect(html).toHaveAttribute("data-theme", "light");
    expect(await page.evaluate((key) => localStorage.getItem(key), KEY)).toBe("light");
    // 点一次只切换一次（脚本没有被执行两遍、重复绑定点击）
    await page.locator("[data-theme-toggle]:visible").first().click();
    await expect(html).toHaveAttribute("data-theme", "dark");

    expect((await page.goto(`/tags/e2e-missing-${Date.now()}`))?.status()).toBe(404);
    await expect(page.getByRole("heading", { name: "404" })).toBeVisible();
    await expect(html).toHaveAttribute("data-theme", "dark");
  });
});

test("a light system keeps the site light by default", async ({ page }) => {
  await page.goto("/tutorials");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
});
