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

  test("readers pick their own language next to the theme button, without changing it for anyone else", async ({ browser, request }) => {
    const reader = await browser.newContext({ storageState: { cookies: [], origins: [] } });
    const page = await reader.newPage();
    const errors = collectErrors(page);
    await page.goto("/");
    await expect(page.locator("html")).toHaveAttribute("lang", "zh-CN");
    const picker = page.getByRole("combobox", { name: "界面语言 · Language" });
    await expect(picker).toHaveValue("zh-CN");
    await Promise.all([page.waitForEvent("load"), picker.selectOption("en")]);
    await expect(page.locator("html")).toHaveAttribute("lang", "en");
    await expect(page.getByRole("link", { name: "All tutorials" }).first()).toBeVisible();
    // 站长没改过的默认页脚文字跟着读者语言换
    await expect(page.locator("footer")).toContainText("Quick links");
    // 站内跳转后仍是读者选的语言，网址里没有语言
    await page.getByRole("link", { name: "All tutorials" }).first().click();
    await expect(page).toHaveURL(/\/tutorials$/);
    await expect(page.locator("html")).toHaveAttribute("lang", "en");
    await expect(page.getByRole("heading", { level: 1, name: "All tutorials" })).toBeVisible();
    // 404 页也是读者的语言
    await page.goto("/no-such-page");
    await expect(page.getByPlaceholder("Search tutorials by keyword")).toBeVisible();

    // 别的访客（没有这个 Cookie）照样看网站语言；RSS 始终是网站语言
    const other = await browser.newContext({ storageState: { cookies: [], origins: [] } });
    const otherPage = await other.newPage();
    await otherPage.goto("/tutorials");
    await expect(otherPage.locator("html")).toHaveAttribute("lang", "zh-CN");
    await other.close();
    expect(await (await request.get("/feed.xml")).text()).toContain("<language>zh-CN</language>");

    // 中间缓存不能存读者选的那份；网站语言那份照常缓存
    const chosen = await page.request.get("/tutorials");
    expect(chosen.headers()["x-accel-expires"]).toBe("0");
    const plain = await request.get("/tutorials", { headers: { cookie: "" } });
    expect(plain.headers()["x-accel-expires"]).toBeUndefined();

    // 选回网站语言：清掉 Cookie
    await page.goto("/");
    await Promise.all([page.waitForEvent("load"), page.getByRole("combobox", { name: "Language" }).selectOption("zh-CN")]);
    await expect(page.locator("html")).toHaveAttribute("lang", "zh-CN");
    expect((await reader.cookies()).some((cookie) => cookie.name === "reader_locale")).toBe(false);
    // 上面故意打开的 404 页会在控制台记一条「404 Not Found」，那条是预期的
    expect(errors.filter((error) => !error.includes("/no-such-page"))).toEqual([]);
    await reader.close();
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
