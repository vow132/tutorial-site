import { rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { expect, test, type Page } from "@playwright/test";
import sharp from "sharp";
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
  // 首页、列表页也不能再出现已删除的教程（缓存同步失效）
  expect(await (await request.get("/")).text()).not.toContain(newSlug);
  expect(await (await request.get("/tutorials")).text()).not.toContain(newSlug);

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

test("category form keeps input on error and clears after creating", async ({ page }) => {
  const errors = collectErrors(page);
  const slug = `e2e-cat-${uniqueSuffix()}`;
  await page.goto("/admin/categories");
  const create = page.locator("form").filter({ has: page.getByRole("button", { name: "创建分类" }) });

  await create.locator('input[name="name"]').fill("E2E 分类");
  await create.locator('input[name="slug"]').fill(slug);
  await create.locator('input[name="description"]').fill("端到端测试分类");
  await create.getByRole("button", { name: "创建分类" }).click();
  await expect(create.getByText("分类已创建")).toBeVisible();
  await expect(create.locator('input[name="name"]')).toHaveValue("");

  // 重复 slug：报错，已填内容保留
  await create.locator('input[name="name"]').fill("重复的分类");
  await create.locator('input[name="slug"]').fill(slug);
  await create.locator('input[name="description"]').fill("保留的描述");
  await create.getByRole("button", { name: "创建分类" }).click();
  await expect(create.getByText("Slug 已被占用")).toBeVisible();
  await expect(create.locator('input[name="name"]')).toHaveValue("重复的分类");
  await expect(create.locator('input[name="description"]')).toHaveValue("保留的描述");

  // 清理
  const row = page.locator("div").filter({ hasText: `/${slug}` }).filter({ has: page.getByRole("button", { name: "删除" }) }).last();
  page.once("dialog", (dialog) => dialog.accept());
  await row.getByRole("button", { name: "删除" }).click();
  await expect(page.getByText(`/${slug}`)).toHaveCount(0);
  expect(errors).toEqual([]);
});

test("uploaded images get alt text, responsive variants and srcset", async ({ page, request }) => {
  const errors = collectErrors(page);
  const id = uniqueSuffix();
  const file = path.join(os.tmpdir(), `flexbox-main-axis.png`);
  await sharp({ create: { width: 2000, height: 1000, channels: 3, background: "#6366f1" } })
    .png()
    .toFile(file);

  await page.goto("/admin/tutorials/new");
  await fillTutorial(page, { title: `E2E 图片 ${id}`, slug: `e2e-image-${id}`, body: "带图片的正文" });
  await page.locator('.tiptap-shell input[type="file"]').setInputFiles(file);
  const image = page.locator(".ProseMirror img");
  await expect(image).toHaveAttribute("alt", "flexbox main axis");
  const src = (await image.getAttribute("src"))!;
  const base = src.replace(/\.[a-z]+$/, "");
  const uploaded = [src, `${base}-400w.webp`, `${base}-800w.webp`, `${base}-1200w.webp`];
  test.info().attach("uploads", { body: uploaded.join("\n") });

  try {
    for (const url of uploaded) expect((await request.get(url)).status(), url).toBe(200);
    await save(page);
    await expect(page).toHaveURL(/\/admin\/tutorials$/);

    await page.goto(`/tutorials/e2e-image-${id}`);
    const rendered = page.locator("article img").first();
    await expect(rendered).toHaveAttribute("srcset", new RegExp(`-800w\\.webp 800w, .*-1200w\\.webp 1200w, .* 1600w$`));
    await expect(rendered).toHaveAttribute("sizes", /820px/);
    await expect(page.locator('meta[property="og:image"]')).toHaveAttribute("content", new RegExp(`${src}$`));
    // 点击正文图片放大，Esc 关闭
    await rendered.click();
    const zoom = page.getByRole("dialog", { name: "flexbox main axis" });
    await expect(zoom).toBeVisible();
    await expect(zoom.getByRole("button", { name: "关闭大图" })).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(zoom).toHaveCount(0);
    // 在清理之前断言：删除时管理列表里对该文章的预取请求会正常返回 404。
    expect(errors).toEqual([]);
  } finally {
    // 清理：删除教程和上传的文件（测试与服务端在同一台机器上运行）。
    await page.goto("/admin/tutorials");
    page.once("dialog", (dialog) => dialog.accept());
    await page.getByRole("row").filter({ hasText: `E2E 图片 ${id}` }).getByRole("button", { name: "删除" }).click();
    await expect(page.getByText(`E2E 图片 ${id}`)).toHaveCount(0);
    expect(await (await request.get("/")).text()).not.toContain(`e2e-image-${id}`);
    await Promise.all(
      uploaded.map((url) => rm(path.join(process.cwd(), "public", url), { force: true })),
    );
    await rm(file, { force: true });
  }
});
