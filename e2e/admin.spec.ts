import { expect, test, type Page } from "@playwright/test";
import { ADMIN_STATE, collectErrors, uniqueSuffix } from "./helpers";

test.use({ storageState: ADMIN_STATE });

async function fillTutorial(
  page: Page,
  data: { title: string; slug: string; excerpt?: string; body?: string },
) {
  await page.locator(".ProseMirror").waitFor();
  await page.fill('input[name="title"]', data.title);
  await page.fill('input[name="slug"]', data.slug);
  await page.locator('select[name="categoryId"]').selectOption({ index: 1 });
  if (data.excerpt !== undefined) await page.fill('textarea[name="excerpt"]', data.excerpt);
  if (data.body) {
    await page.locator(".ProseMirror").click();
    await page.keyboard.type(data.body);
  }
}

async function save(page: Page) {
  await page.getByRole("button", { name: "保存教程" }).click();
}

/** 管理列表里按标题找到教程的编辑地址。 */
async function editUrl(page: Page, title: string) {
  await page.goto("/admin/tutorials");
  const href = await page
    .getByRole("row")
    .filter({ hasText: title })
    .locator('a[href^="/admin/tutorials/"]')
    .first()
    .getAttribute("href");
  expect(href).toMatch(/^\/admin\/tutorials\/\d+$/);
  return href!;
}

test("tutorial lifecycle keeps the cached article page in sync", async ({ page, request }) => {
  const errors = collectErrors(page);
  const id = uniqueSuffix();
  // 中文 slug：覆盖“缓存键是编码后路径”的失效逻辑。
  const slug = `e2e-教程-${id}`;
  const path = `/tutorials/${encodeURIComponent(slug)}`;
  const title = `E2E 教程 ${id}`;

  // 新建并发布
  await page.goto("/admin/tutorials/new");
  await fillTutorial(page, { title, slug, excerpt: "端到端测试摘要", body: "端到端测试正文" });
  await save(page);
  await expect(page).toHaveURL(/\/admin\/tutorials$/);

  // 前台可见，第二次请求命中缓存
  await expect(page.goto(path).then((r) => r?.status())).resolves.toBe(200);
  await expect(page.locator("h1")).toHaveText(title);
  expect((await request.get(path)).headers()["x-nextjs-cache"]).toBe("HIT");

  // Slug 重复：报错且已填内容保留
  await page.goto("/admin/tutorials/new");
  await fillTutorial(page, { title: "不会保存的教程", slug, excerpt: "保留的摘要", body: "保留的正文" });
  await save(page);
  await expect(page.getByText("Slug 已被占用")).toBeVisible();
  await expect(page.locator('input[name="title"]')).toHaveValue("不会保存的教程");
  await expect(page.locator('input[name="slug"]')).toHaveValue(slug);
  await expect(page.locator('textarea[name="excerpt"]')).toHaveValue("保留的摘要");
  await expect(page.locator(".ProseMirror")).toContainText("保留的正文");

  // 修改标题：缓存页立即更新
  const edit = await editUrl(page, title);
  const renamed = `${title}（已修改）`;
  await page.goto(edit);
  await page.locator(".ProseMirror").waitFor();
  await page.fill('input[name="title"]', renamed);
  await save(page);
  await expect(page).toHaveURL(/\/admin\/tutorials$/);
  await page.goto(path);
  await expect(page.locator("h1")).toHaveText(renamed);

  // 修改 slug：旧地址立即 404，新地址可访问
  const newSlug = `e2e-moved-${id}`;
  await page.goto(edit);
  await page.locator(".ProseMirror").waitFor();
  await page.fill('input[name="slug"]', newSlug);
  await save(page);
  await expect(page).toHaveURL(/\/admin\/tutorials$/);
  expect((await request.get(path)).status()).toBe(404);
  expect((await request.get(`/tutorials/${newSlug}`)).status()).toBe(200);

  // 删除：地址立即 404
  await page.goto("/admin/tutorials");
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("row").filter({ hasText: renamed }).getByRole("button", { name: "删除" }).click();
  await expect(page.getByText(renamed)).toHaveCount(0);
  expect((await request.get(`/tutorials/${newSlug}`)).status()).toBe(404);

  expect(errors).toEqual([]);
});

test("search engine verification codes are saved and rendered", async ({ page, request }) => {
  await page.goto("/admin/settings");
  await page.fill('input[name="verification.bing"]', "bad code");
  await page.getByRole("button", { name: "保存设置" }).click();
  await expect(page.getByText("验证码格式不对")).toBeVisible();

  await page.fill('input[name="verification.bing"]', "");
  await page.fill(
    'input[name="verification.baidu"]',
    '<meta name="baidu-site-verification" content="codeva-E2E123" />',
  );
  await page.getByRole("button", { name: "保存设置" }).click();
  await expect(page.getByText("设置已保存")).toBeVisible();
  expect(await (await request.get("/")).text()).toContain(
    '<meta name="baidu-site-verification" content="codeva-E2E123"/>',
  );

  await page.fill('input[name="verification.baidu"]', "");
  await page.getByRole("button", { name: "保存设置" }).click();
  await expect(page.getByText("设置已保存")).toBeVisible();
  expect(await (await request.get("/")).text()).not.toContain("baidu-site-verification");
});
