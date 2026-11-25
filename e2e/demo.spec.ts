import { expect, test } from "@playwright/test";
import { admin, collectErrors, queryDatabase } from "./helpers";

/*
 * 演示模式（lib/demo.ts）。只在 E2E_DEMO=1 时运行：playwright.config.ts 会以 DEMO_MODE=true 另起一个服务器。
 * 前台只看动态页面（搜索页）：普通测试跑过后 .next 里可能还缓存着不带横幅的静态页。
 */

const siteSettings = () => queryDatabase<{ value: string }>("SELECT value FROM Setting WHERE key = 'site'")?.value ?? "";

test("the demo site publishes its admin account and keeps the admin read-only", async ({ page }) => {
  const errors = collectErrors(page);

  // 前台：横幅告诉访客后台账号
  await page.goto("/search?q=flex");
  await expect(page.getByText(`账号 ${admin.username}，密码 ${admin.password}`)).toBeVisible();

  // 登录页：账号密码已经填好，直接登录；公开的密码不再提示「请修改密码」
  await page.goto("/admin/login");
  await expect(page.getByLabel("用户名")).toHaveValue(admin.username);
  await expect(page.getByLabel("密码")).toHaveValue(admin.password);
  await page.getByRole("button", { name: /^登\s*录$/ }).click();
  await expect(page).toHaveURL(/\/admin$/);
  await expect(page.getByText("后台可以随便看，保存、上传、删除都不会生效")).toBeVisible();

  // 保存设置：在浏览器里就拦下并说明原因，数据库没变
  const before = siteSettings();
  await page.goto("/admin/settings");
  await page.locator('input[name="siteName"]').fill("演示站被改了");
  await page.getByRole("button", { name: "保存设置" }).click();
  await expect(page.getByRole("status").getByText(/这是演示站，只能看、不能保存修改/)).toBeVisible();
  expect(siteSettings()).toBe(before);

  // 删除教程这种没有提示框的表单也一样被拦下
  const tutorials = () => queryDatabase<{ n: number }>("SELECT COUNT(*) AS n FROM Tutorial")!.n;
  const count = tutorials();
  await page.goto("/admin/tutorials");
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: /删除/ }).first().click();
  await expect(page.getByRole("status").getByText(/只能看/)).toBeVisible();
  expect(tutorials()).toBe(count);

  // 筛选只是跳转，照常能用
  const filter = page.getByRole("searchbox", { name: "搜索标题或 Slug" });
  await filter.fill("Flexbox");
  await filter.press("Enter");
  await expect(page).toHaveURL(/[?&]q=Flexbox/);

  // 服务端兜底：绕过页面直接调接口也不行
  const upload = await page.request.post("/api/upload", {
    multipart: { file: { name: "x.png", mimeType: "image/png", buffer: Buffer.from("not really an image") } },
  });
  expect(upload.status()).toBe(403);
  expect((await upload.json()).error).toMatch(/演示站/);
  const update = await page.request.post("/api/admin/site-update", { data: { password: admin.password } });
  expect(update.status()).toBe(403);

  // 读者留言不入库（后台对所有访客开放，存下来就等于公开展示）
  const tutorial = queryDatabase<{ id: number }>("SELECT id FROM Tutorial WHERE published = 1 ORDER BY id LIMIT 1")!;
  const messages = () => queryDatabase<{ n: number }>("SELECT COUNT(*) AS n FROM FeedbackMessage")!.n;
  const messagesBefore = messages();
  const message = await page.request.post("/api/feedback/message", {
    data: { id: tutorial.id, message: "演示站里的留言" },
    headers: { "Sec-Fetch-Site": "same-origin" },
  });
  expect(message.status()).toBe(204);
  expect(messages()).toBe(messagesBefore);

  // 退出登录照常可用
  await page.goto("/admin");
  await page.getByRole("button", { name: "退出登录" }).click();
  await expect(page).toHaveURL(/\/admin\/login/);
  expect(errors).toEqual([]);
});
