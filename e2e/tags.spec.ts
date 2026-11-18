import { expect, test, type Page } from "@playwright/test";
import { ADMIN_STATE, collectErrors, uniqueSuffix } from "./helpers";

test.use({ storageState: ADMIN_STATE });

async function createTutorial(page: Page, data: { title: string; slug: string; category: number; tags: string[]; pending?: string }) {
  await page.goto("/admin/tutorials/new");
  await page.locator(".ProseMirror").waitFor();
  await page.fill('input[name="title"]', data.title);
  await page.fill('input[name="slug"]', data.slug);
  await page.locator('select[name="categoryId"]').selectOption({ index: data.category });
  const tagInput = page.getByLabel(/^标签/);
  for (const tag of data.tags) {
    await tagInput.fill(tag);
    await tagInput.press("Enter");
  }
  // 没按回车的文字也要算上
  if (data.pending) await tagInput.fill(data.pending);
  await page.locator(".ProseMirror").click();
  await page.keyboard.type(`${data.title} 的正文`);
  await page.getByRole("button", { name: "保存教程" }).click();
  await expect(page).toHaveURL(/\/admin\/tutorials(\?saved=[\w-]+)?$/);
}

async function deleteTutorial(page: Page, title: string) {
  await page.goto("/admin/tutorials");
  const row = page.getByRole("row").filter({ hasText: title });
  if (!(await row.count())) return;
  page.once("dialog", (dialog) => dialog.accept());
  await row.getByRole("button", { name: "删除" }).click();
  await expect(page.getByText(title)).toHaveCount(0);
}

async function deleteTag(page: Page, name: string) {
  await page.goto("/admin/tags");
  const row = page.getByRole("row").filter({ has: page.locator(`input[value="${name}"]`) });
  if (!(await row.count())) return;
  page.once("dialog", (dialog) => dialog.accept());
  await row.getByRole("button", { name: "删除" }).click();
  await expect(page.locator(`input[value="${name}"]`)).toHaveCount(0);
}

test("tags link tutorials across categories, get their own pages, and can be merged", async ({ page, request }) => {
  const errors = collectErrors(page);
  const id = uniqueSuffix();
  const shared = `E2E共享${id}`;
  const solo = `e2e单独${id}`;
  const pending = `e2e待定${id}`;
  const first = { title: `E2E 标签甲 ${id}`, slug: `e2e-tag-a-${id}` };
  const second = { title: `E2E 标签乙 ${id}`, slug: `e2e-tag-b-${id}` };
  const sharedSlug = shared.toLowerCase();

  try {
    // 两篇放在不同的顶级分类里：只靠共同标签才算相关
    await createTutorial(page, { ...first, category: 1, tags: [shared, solo], pending });
    await page.goto(`/tutorials/${first.slug}`);
    const chips = page.getByRole("list", { name: "标签" });
    await expect(chips.getByRole("link")).toHaveText([`#${shared}`, `#${solo}`, `#${pending}`]);
    await expect(page.locator('meta[property="article:tag"]')).toHaveCount(3);

    // 只有一篇教程的标签页：能访问，但不让收录
    await chips.getByRole("link", { name: `#${shared}` }).click();
    await expect(page).toHaveURL(new RegExp(`/tags/${encodeURIComponent(sharedSlug)}$`));
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(`#${shared}`);
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);

    await createTutorial(page, { ...second, category: 2, tags: [shared] });
    await page.goto(`/tags/${encodeURIComponent(sharedSlug)}`);
    await expect(page.getByText("共 2 篇相关教程")).toBeVisible();
    await expect(page.locator('meta[name="robots"]')).toHaveCount(0);
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute("href", new RegExp(`/tags/${encodeURIComponent(sharedSlug)}$`));

    await page.goto(`/tutorials/${second.slug}`);
    await expect(page.locator('section[aria-labelledby="related-heading"]')).toContainText(first.title);

    await page.goto("/tags");
    await expect(page.getByRole("link", { name: new RegExp(`#${shared}\\s*2`) })).toBeVisible();

    // 把「待定」改名成「共享」：合并，第一篇不会出现两次
    await page.goto("/admin/tags");
    const row = page.getByRole("row").filter({ has: page.locator(`input[value="${pending}"]`) });
    await row.getByRole("textbox").fill(shared);
    await row.getByRole("button", { name: "改名" }).click();
    await expect(page.getByText(`已合并到「${shared}」`)).toBeVisible();
    await page.goto(`/tutorials/${first.slug}`);
    await expect(page.getByRole("list", { name: "标签" }).getByRole("link")).toHaveText([`#${shared}`, `#${solo}`]);
    expect((await request.get(`/tags/${encodeURIComponent(pending)}`)).status()).toBe(404);
    expect(errors).toEqual([]);
  } finally {
    await deleteTutorial(page, first.title);
    await deleteTutorial(page, second.title);
    for (const name of [shared, solo, pending]) await deleteTag(page, name);
  }
  expect((await request.get(`/tags/${encodeURIComponent(sharedSlug)}`)).status()).toBe(404);
});

test("seeded tags with enough tutorials are listed in the sitemap", async ({ request }) => {
  const sitemap = await (await request.get("/sitemap.xml")).text();
  expect(sitemap).toContain(`/tags/${encodeURIComponent("前端基础")}`);
});

test("the about page is published from the admin and disappears when cleared", async ({ page, request }) => {
  const errors = collectErrors(page);
  const id = uniqueSuffix();
  await page.goto("/admin/about");
  await page.locator(".ProseMirror").waitFor();
  await page.fill("#about-title", `关于 E2E ${id}`);
  await page.locator(".ProseMirror").click();
  await page.keyboard.press("ControlOrMeta+A");
  await page.keyboard.type(`这是 E2E 关于页面 ${id}`);
  await page.getByRole("button", { name: "保存关于页面" }).click();
  await expect(page.getByText("已保存")).toBeVisible();

  try {
    await page.goto("/about");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(`关于 E2E ${id}`);
    await expect(page.locator(".article-body")).toContainText(`这是 E2E 关于页面 ${id}`);
    const types = (await page.locator('script[type="application/ld+json"]').allTextContents()).flatMap((text) =>
      (JSON.parse(text)["@graph"] ?? []).map((item: { "@type": string }) => item["@type"]),
    );
    expect(types).toContain("AboutPage");
    expect(errors).toEqual([]);
  } finally {
    await page.goto("/admin/about");
    await page.locator(".ProseMirror").click();
    await page.keyboard.press("ControlOrMeta+A");
    await page.keyboard.press("Delete");
    await page.getByRole("button", { name: "保存关于页面" }).click();
    await expect(page.getByText("已清空")).toBeVisible();
  }
  expect((await request.get("/about")).status()).toBe(404);
});
