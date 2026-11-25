import { expect, test, type Page } from "@playwright/test";
import { ADMIN_STATE, collectErrors, createTutorialViaForm, deleteTutorialRow, queryDatabase, uniqueSuffix } from "./helpers";

test.use({ storageState: ADMIN_STATE });

/** 账号管理页里某个账号的那一行。 */
const userRow = (page: Page, username: string) =>
  page.getByRole("listitem").filter({ has: page.getByText(username, { exact: true }) });

test("owners give each writer an account; authors can only reach their own tutorials", async ({ page, browser }) => {
  const errors = collectErrors(page);
  const id = uniqueSuffix();
  const username = `e2e-w-${id}`.slice(0, 32);
  const title = `e2e-署名-${id}`;
  const slug = `e2e-byline-${id}`;

  await page.goto("/admin/users");
  await page.getByLabel("用户名", { exact: true }).fill(username);
  await page.getByLabel("署名", { exact: true }).fill("E2E 作者");
  await page.getByRole("button", { name: "创建账号" }).click();
  await expect(page.getByText(`已创建 ${username}（作者）`)).toBeVisible();
  const password = await page.getByLabel("一次性密码").inputValue();
  expect(password.length).toBeGreaterThanOrEqual(20);

  const writerContext = await browser.newContext({ storageState: { cookies: [], origins: [] } });
  const writer = await writerContext.newPage();
  try {
    // 作者登录：随机密码够强，不会被带去改密码页；侧栏只有自己能用的
    await writer.goto("/admin/login");
    await writer.fill('input[name="username"]', username);
    await writer.fill('input[name="password"]', password);
    await writer.getByRole("button", { name: /^登\s*录$/ }).click();
    await expect(writer).toHaveURL(/\/admin$/);
    const nav = writer.getByRole("navigation", { name: "后台导航" }).first();
    await expect(nav.getByRole("link", { name: "教程管理" })).toBeAttached();
    for (const hidden of ["站点设置", "账号管理", "分类管理", "安全日志", "邮件订阅"]) {
      await expect(nav.getByRole("link", { name: hidden })).toHaveCount(0);
    }
    // 直接打开没权限的页面：带回仪表盘并说明
    await writer.goto("/admin/settings");
    await expect(writer).toHaveURL(/\/admin\?forbidden=1$/);
    await expect(writer.getByText(/没有打开那个页面的权限/)).toBeVisible();

    // 别人的教程：列表里看不到，编辑页、导出、一键更新接口都进不去
    const others = queryDatabase<{ id: number; title: string }>(
      'SELECT t.id, t.title FROM "Tutorial" t JOIN "Admin" a ON a.id = t.authorId WHERE a.username <> ? LIMIT 1',
      username,
    )!;
    await writer.goto("/admin/tutorials");
    await expect(writer.getByText("还没有教程，点击右上角开始创作")).toBeVisible();
    await writer.goto(`/admin/tutorials/${others.id}`);
    await expect(writer).toHaveURL(/\/admin\/tutorials\?forbidden=1$/);
    expect((await writer.request.get(`/admin/tutorials/${others.id}/markdown`)).status()).toBe(403);
    expect((await writer.request.get("/api/admin/site-update")).status()).toBe(403);

    // 自己写一篇：作者是自己，文章页显示署名（不显示登录用户名）
    await createTutorialViaForm(writer, { title, slug });
    await expect(writer.getByRole("row").filter({ hasText: title })).toBeVisible();
    const written = queryDatabase<{ username: string }>(
      'SELECT a.username FROM "Tutorial" t JOIN "Admin" a ON a.id = t.authorId WHERE t.slug = ?',
      slug,
    )!;
    expect(written.username).toBe(username);
    await writer.goto(`/tutorials/${slug}`);
    await expect(writer.locator("article, main").first()).toContainText("作者 E2E 作者");
    await expect(writer.locator("main")).not.toContainText(username);

    // 站长把他改成编辑：马上能看到、能改所有教程
    await page.goto("/admin/users");
    await userRow(page, username).getByLabel(`${username} 的角色`).selectOption("editor");
    await userRow(page, username).getByRole("button", { name: "保存" }).click();
    await expect(userRow(page, username).getByText(`已保存 ${username}`)).toBeVisible();
    await writer.goto(`/admin/tutorials/${others.id}`);
    await expect(writer.getByRole("heading", { name: "编辑教程" })).toBeVisible();
    await expect(writer.getByLabel("作者")).toBeVisible();

    // 站长自己的角色不能改
    await expect(page.getByRole("listitem").filter({ hasText: "你" }).getByRole("combobox")).toBeDisabled();
  } finally {
    await writerContext.close();
    // 删除账号：他的教程转给站长，再删掉测试教程
    await page.goto("/admin/users");
    if (await userRow(page, username).count()) {
      page.once("dialog", (dialog) => dialog.accept());
      await userRow(page, username).getByRole("button", { name: /删除账号/ }).click();
      await expect(page.getByText(new RegExp(`已删除 ${username}`))).toBeVisible();
    }
    const orphan = queryDatabase<{ n: number }>('SELECT COUNT(*) AS n FROM "Tutorial" WHERE slug = ? AND authorId IS NULL', slug);
    expect(orphan?.n ?? 0).toBe(0);
    await deleteTutorialRow(page, title);
  }
  expect(errors).toEqual([]);
});
