import { expect, test } from "@playwright/test";
import { setupCodeFrom } from "../lib/setup-code.mjs";
import { collectErrors, queryDatabase } from "./helpers";

/*
 * 首次安装（/admin/setup）。只在 E2E_SETUP=1 时运行：服务器用一个没有后台账号的新数据库（e2e/fresh-setup-db.mjs）。
 * 前台只看动态页面（搜索页），不碰 ISR 页面，免得这个库的内容缓存进 .next 影响普通测试。
 */

const PASSWORD = "Setup-Flow-Passw0rd!";

test("a fresh site asks for the install code, creates the owner account and logs straight in", async ({ page, browser }) => {
  const errors = collectErrors(page);
  const code = setupCodeFrom({ NODE_ENV: "production", AUTH_SECRET: process.env.AUTH_SECRET });
  expect(code, "测试需要和服务器相同的 AUTH_SECRET").toBeTruthy();
  expect(queryDatabase<{ n: number }>('SELECT COUNT(*) AS n FROM "Admin"')!.n).toBe(0);

  // 后台任何地址都带到安装页
  await page.goto("/admin/settings");
  await expect(page).toHaveURL(/\/admin\/setup$/);
  await expect(page.getByRole("heading", { name: "欢迎！先完成安装" })).toBeVisible();

  const submit = () => page.getByRole("button", { name: "完成安装并进入后台" }).click();
  await page.getByLabel("站点名称").fill("E2E 安装测试站");
  await page.getByLabel("站长用户名").fill("owner");
  await page.getByLabel("密码", { exact: true }).fill(PASSWORD);
  await page.getByLabel("再输一次密码").fill(PASSWORD);

  // 安装码不对：不建账号
  await page.getByLabel("安装码").fill("AAAA-AAAA");
  await submit();
  await expect(page.locator("form").getByRole("alert")).toContainText("安装码不对");

  // 密码太弱、两次不一致：说明原因，已填的内容还在
  await page.getByLabel("安装码").fill(code!.toLowerCase());
  await page.getByLabel("密码", { exact: true }).fill("aaaaaaaaaaaa");
  await page.getByLabel("再输一次密码").fill("aaaaaaaaaaaa");
  await submit();
  await expect(page.locator("form").getByRole("alert")).toContainText("字符种类太少");
  await expect(page.getByLabel("站点名称")).toHaveValue("E2E 安装测试站");
  await page.getByLabel("密码", { exact: true }).fill(PASSWORD);
  await page.getByLabel("再输一次密码").fill(`${PASSWORD}x`);
  await submit();
  await expect(page.locator("form").getByRole("alert")).toContainText("两次输入的密码不一样");
  expect(queryDatabase<{ n: number }>('SELECT COUNT(*) AS n FROM "Admin"')!.n).toBe(0);

  // 正确：从空白开始（不保留示例数据），装好直接进后台
  await page.getByLabel("再输一次密码").fill(PASSWORD);
  await page.getByLabel(/保留示例教程和分类/).uncheck();
  await submit();
  await expect(page).toHaveURL(/\/admin\?welcome=1$/);
  await expect(page.getByText("安装完成，欢迎！")).toBeVisible();
  await expect(page.getByRole("link", { name: "账号管理" }).first()).toBeAttached();
  const owner = queryDatabase<{ username: string; role: string }>('SELECT username, role FROM "Admin"')!;
  expect(owner).toEqual({ username: "owner", role: "owner" });
  expect(queryDatabase<{ n: number }>('SELECT COUNT(*) AS n FROM "Tutorial"')!.n).toBe(0);

  // 站名生效：网站标题、Logo 字符一起换掉
  await page.goto("/search?q=x");
  await expect(page).toHaveTitle(/E2E 安装测试站/);
  await expect(page.locator("header").first()).toContainText("E2E 安装测试站");

  // 装好以后安装页关闭：别人打开只会看到登录页，用新账号能登录
  const other = await browser.newContext();
  const visitor = await other.newPage();
  await visitor.goto("/admin/setup");
  await expect(visitor).toHaveURL(/\/admin\/login/);
  await visitor.fill('input[name="username"]', "owner");
  await visitor.fill('input[name="password"]', PASSWORD);
  await visitor.getByRole("button", { name: /^登\s*录$/ }).click();
  await expect(visitor).toHaveURL(/\/admin$/);
  await other.close();
  expect(errors).toEqual([]);
});
