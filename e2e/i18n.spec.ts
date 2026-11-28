import { expect, test, type Page } from "@playwright/test";
import { ADMIN_STATE, collectErrors, queryDatabase } from "./helpers";

test.use({ storageState: ADMIN_STATE });

const siteLocale = () =>
  JSON.parse(queryDatabase<{ value: string }>('SELECT "value" FROM "Setting" WHERE "key" = ?', "site")?.value ?? "{}").locale ?? "zh-CN";

/** 在站点设置里换网站语言并保存（按钮文字随后台语言变，所以按表单定位） */
async function setSiteLocale(page: Page, locale: string) {
  await page.goto("/admin/settings");
  const form = page.locator("form", { has: page.locator("#site-locale") });
  await form.locator("#site-locale").selectOption(locale);
  await form.locator('button[type="submit"]').click();
  await expect.poll(siteLocale).toBe(locale);
}

const sidebarLanguage = (page: Page) => page.locator("aside select:visible").first();

test.describe.serial("interface languages", () => {
  test.afterAll(async ({ browser }) => {
    // 不管中途哪里失败，都把网站语言换回中文、清掉后台语言 Cookie，免得影响后面的测试
    const context = await browser.newContext({ storageState: ADMIN_STATE });
    await context.clearCookies({ name: "admin_locale" });
    const page = await context.newPage();
    if (siteLocale() !== "zh-CN") await setSiteLocale(page, "zh-CN");
    await context.close();
  });

  test("the public site follows the site language", async ({ page, request }) => {
    const errors = collectErrors(page);
    const cases = [
      { locale: "en", nav: "All tutorials", search: "Search tutorials…", tags: "All tags" },
      { locale: "ru", nav: "Все уроки", search: "Поиск уроков…", tags: "Все теги" },
      { locale: "ja", nav: "すべてのチュートリアル", search: "チュートリアルを検索…", tags: "すべてのタグ" },
    ];
    for (const item of cases) {
      await setSiteLocale(page, item.locale);
      await page.goto("/");
      await expect(page.locator("html")).toHaveAttribute("lang", item.locale);
      await expect(page.getByRole("link", { name: item.nav }).first()).toBeVisible();
      await expect(page.getByPlaceholder(item.search).first()).toBeAttached();
      await page.goto("/tags");
      await expect(page.getByRole("heading", { level: 1, name: item.tags })).toBeVisible();
      expect(await (await request.get("/feed.xml")).text()).toContain(`<language>${item.locale}</language>`);
    }
    expect(errors).toEqual([]);
  });

  test("an article page has no Chinese interface text left in English", async ({ page }) => {
    await setSiteLocale(page, "en");
    await page.goto("/tutorials");
    await page.locator("main a[href^='/tutorials/']").first().click();
    await expect(page.locator("html")).toHaveAttribute("lang", "en");
    await expect(page.getByText("Was this tutorial helpful?")).toBeVisible();
    const text = await page.locator("body").innerText();
    for (const phrase of ["本页目录", "这篇教程对你有帮助吗", "上一篇", "下一篇", "相关教程", "复制代码", "分钟读完", "全部教程"]) {
      expect(text, phrase).not.toContain(phrase);
    }
  });

  test("each admin picks their own interface language, independent of the site", async ({ page }) => {
    await setSiteLocale(page, "zh-CN");
    await page.goto("/admin");
    await expect(page.getByRole("heading", { level: 1, name: "仪表盘" })).toBeVisible();

    await sidebarLanguage(page).selectOption("en");
    await expect(page.getByRole("heading", { level: 1, name: "Dashboard" })).toBeVisible();
    await page.goto("/admin/tutorials");
    await expect(page.getByRole("heading", { level: 1, name: "Tutorials" })).toBeVisible();
    // 前台仍是网站语言
    await page.goto("/");
    await expect(page.locator("html")).toHaveAttribute("lang", "zh-CN");

    await page.goto("/admin");
    await sidebarLanguage(page).selectOption("ja");
    await expect(page.getByRole("heading", { level: 1, name: "ダッシュボード" })).toBeVisible();
    await sidebarLanguage(page).selectOption("ru");
    await expect(page.getByRole("heading", { level: 1, name: "Панель" })).toBeVisible();
    await sidebarLanguage(page).selectOption("zh-CN");
    await expect(page.getByRole("heading", { level: 1, name: "仪表盘" })).toBeVisible();
  });

  test("the sign-in page can switch language before signing in", async ({ browser }) => {
    const context = await browser.newContext({ storageState: { cookies: [], origins: [] }, locale: "zh-CN" });
    const page = await context.newPage();
    await page.goto("/admin/login");
    await expect(page.getByRole("button", { name: "登 录" })).toBeVisible();
    await page.locator("main select, select").first().selectOption("en");
    await expect(page.getByRole("button", { name: "Sign in", exact: true })).toBeVisible();
    await context.close();
  });
});
