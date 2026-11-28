import { expect, test, type Page } from "@playwright/test";
import { ADMIN_STATE, collectErrors, uniqueSuffix } from "./helpers";

// 单个操作最多等 10 秒：卡住时报出是哪一步，而不是笼统的整条用例超时
test.use({ storageState: ADMIN_STATE, actionTimeout: 10_000 });

const SAVED = /\/admin\/tutorials(\?saved=[\w-]+)?$/;

async function startTutorial(page: Page, title: string, slug: string, body: string) {
  await page.goto("/admin/tutorials/new");
  await page.locator(".ProseMirror").waitFor();
  await page.fill('input[name="title"]', title);
  await page.fill('input[name="slug"]', slug);
  await page.locator('select[name="categoryId"]').selectOption({ index: 1 });
  await page.locator(".ProseMirror").click();
  await page.keyboard.type(body);
}

async function tutorialId(page: Page, title: string) {
  await page.goto("/admin/tutorials");
  const href = await page.getByRole("row").filter({ hasText: title }).locator('a[href^="/admin/tutorials/"]').first().getAttribute("href");
  return Number(href!.split("/").pop());
}

async function remove(page: Page, title: string) {
  await page.goto("/admin/tutorials");
  const row = page.getByRole("row").filter({ hasText: title });
  if (!(await row.count())) return;
  page.once("dialog", (dialog) => dialog.accept());
  await row.getByRole("button", { name: "删除" }).click();
  await expect(page.getByText(title)).toHaveCount(0);
}

test("the editor makes tables and code blocks with a chosen language", async ({ page }) => {
  const errors = collectErrors(page);
  const id = uniqueSuffix();
  const title = `E2E 表格 ${id}`;
  try {
    // 全程用键盘移动光标，不去点正文里的段落：工具栏是吸顶的，
    // 字体不同时段落可能正好被它挡住，点击会一直重试到超时。
    await startTutorial(page, title, `e2e-table-${id}`, "下面是一段代码：");
    await page.keyboard.press("Enter");
    await page.getByRole("button", { name: "代码块" }).click();
    await page.keyboard.type("SELECT 1;");
    await page.getByLabel("代码语言").selectOption("sql");
    await expect(page.locator('.ProseMirror pre code[class*="language-sql"]')).toHaveCount(1);

    // 选完语言焦点回到编辑器、光标仍在代码末尾：按 ↓ 跳出代码块，接着插表格
    await expect(page.locator(".ProseMirror")).toBeFocused();
    await page.keyboard.press("ArrowDown");
    await page.getByRole("button", { name: "▦ 表格" }).click();
    await page.keyboard.type("命令");
    await page.keyboard.press("Tab");
    await page.keyboard.type("说明");
    await page.getByRole("button", { name: "+行" }).click();
    await expect(page.locator(".ProseMirror table tr")).toHaveCount(4);
    await expect(page.locator(".ProseMirror table th")).toHaveCount(3);
    await expect(page.locator(".ProseMirror pre")).toHaveCount(1);

    await page.getByRole("button", { name: "保存教程" }).click();
    await expect(page).toHaveURL(SAVED);
    await page.goto(`/tutorials/e2e-table-${id}`);
    const table = page.locator(".article-body .table-wrap table");
    await expect(table.locator("th").first()).toHaveText("命令");
    await expect(table.locator("tr")).toHaveCount(4);
    await expect(page.locator(".article-body .code-lang")).toHaveText("SQL");
    expect(errors).toEqual([]);
  } finally {
    await remove(page, title);
  }
});

test("unsaved edits are kept in this browser and can be restored or discarded", async ({ page }) => {
  const id = uniqueSuffix();
  const title = `E2E 草稿 ${id}`;
  const stored = () => page.evaluate(() => localStorage.getItem("tutorial-draft:new"));
  try {
    await startTutorial(page, title, `e2e-draft-${id}`, `草稿正文 ${id}`);
    await expect.poll(stored, { timeout: 10_000 }).toContain(`草稿正文 ${id}`);
    await expect(page.getByText(/草稿已自动保存在本浏览器/)).toBeVisible();

    // 模拟误关页面：重新打开后可以恢复
    await page.reload();
    await page.getByRole("button", { name: "恢复草稿" }).click();
    await expect(page.locator('input[name="title"]')).toHaveValue(title);
    await expect(page.locator(".ProseMirror")).toContainText(`草稿正文 ${id}`);

    // 丢弃后不再提示
    await page.reload();
    await page.getByRole("button", { name: "丢弃" }).click();
    expect(await stored()).toBeNull();
    await page.reload();
    await page.locator(".ProseMirror").waitFor();
    await expect(page.getByRole("button", { name: "恢复草稿" })).toHaveCount(0);

    // 保存成功后草稿自动清掉
    await startTutorial(page, title, `e2e-draft-${id}`, "正式内容");
    await expect.poll(stored, { timeout: 10_000 }).not.toBeNull();
    await page.getByRole("button", { name: "保存教程" }).click();
    await expect(page).toHaveURL(/\/admin\/tutorials$/);
    expect(await stored()).toBeNull();
  } finally {
    await page.evaluate(() => localStorage.removeItem("tutorial-draft:new"));
    await remove(page, title);
  }
});

test("drafts can be previewed, edits keep history, and old versions can be restored", async ({ page, request }) => {
  const errors = collectErrors(page);
  const id = uniqueSuffix();
  const title = `E2E 版本 ${id}`;
  const slug = `e2e-revision-${id}`;
  try {
    await startTutorial(page, title, slug, "第一版内容");
    await page.getByLabel("存为草稿").check();
    await page.getByRole("button", { name: "保存教程" }).click();
    await expect(page).toHaveURL(SAVED);
    expect((await request.get(`/tutorials/${slug}`)).status()).toBe(404);

    const tutorial = await tutorialId(page, title);
    await page.goto(`/admin/preview/${tutorial}`);
    await expect(page.getByText("预览模式")).toBeVisible();
    await expect(page.getByText(/草稿（前台看不到）/)).toBeVisible();
    await expect(page.locator(".article-body")).toContainText("第一版内容");

    await page.goto(`/admin/tutorials/${tutorial}`);
    await page.locator(".ProseMirror").click();
    await page.keyboard.press("ControlOrMeta+A");
    await page.keyboard.type("第二版内容");
    await page.getByRole("button", { name: "保存教程" }).click();
    await expect(page).toHaveURL(SAVED);

    await page.goto(`/admin/tutorials/${tutorial}/revisions`);
    const versions = page.getByRole("listitem");
    await expect(versions).toHaveCount(1);
    await versions.first().locator("summary").click();
    await expect(versions.first().locator(".article-body")).toContainText("第一版内容");
    page.once("dialog", (dialog) => dialog.accept());
    await versions.first().getByRole("button", { name: "恢复此版本" }).click();
    await expect(page.getByText("已恢复")).toBeVisible();
    await expect(page.getByRole("listitem")).toHaveCount(2);

    await page.goto(`/admin/preview/${tutorial}`);
    await expect(page.locator(".article-body")).toContainText("第一版内容");
    expect(errors).toEqual([]);
  } finally {
    await remove(page, title);
  }
});

test("scheduled tutorials go live by themselves", async ({ page, request }) => {
  const id = uniqueSuffix();
  const title = `E2E 定时 ${id}`;
  const slug = `e2e-scheduled-${id}`;
  try {
    await startTutorial(page, title, slug, "到点自动发布");
    await page.getByLabel("定时发布").check();
    await expect(page.getByLabel("发布时间")).toBeVisible();
    // 界面只能选到分钟；测试里直接把换算后的时间改成 8 秒后，免得等一分钟
    await page.locator('input[name="publishAt"]').evaluate((input: HTMLInputElement) => {
      input.value = new Date(Date.now() + 8000).toISOString();
    });
    await page.getByRole("button", { name: "保存教程" }).click();
    await expect(page).toHaveURL(SAVED);
    await expect(page.getByRole("row").filter({ hasText: title }).getByRole("button", { name: /^定时/ })).toBeVisible();
    expect((await request.get(`/tutorials/${slug}`)).status()).toBe(404);

    await expect.poll(async () => (await request.get(`/tutorials/${slug}`)).status(), { timeout: 40_000, intervals: [2000] }).toBe(200);
    await page.goto("/admin/tutorials");
    await expect(page.getByRole("row").filter({ hasText: title }).getByRole("button", { name: "已发布" })).toBeVisible();
    expect(await (await request.get("/tutorials")).text()).toContain(title);
    // 安全日志里操作人是「定时发布」（按后台语言显示，库里存的不是某种语言的文字）
    await page.goto("/admin/audit");
    const entry = page.getByRole("row").filter({ hasText: title }).filter({ hasText: "定时发布" });
    await expect(entry).toHaveCount(1);
    await expect(entry).not.toContainText("@scheduler");
  } finally {
    await remove(page, title);
  }
});

test("a schedule in the past is rejected and the form keeps its content", async ({ page }) => {
  const id = uniqueSuffix();
  await startTutorial(page, `E2E 过去 ${id}`, `e2e-past-${id}`, "内容");
  await page.getByLabel("定时发布").check();
  await page.locator('input[name="publishAt"]').evaluate((input: HTMLInputElement) => {
    input.value = new Date(Date.now() - 60_000).toISOString();
  });
  await page.getByRole("button", { name: "保存教程" }).click();
  await expect(page.getByText("定时发布时间要晚于现在")).toBeVisible();
  await expect(page.locator('input[name="title"]')).toHaveValue(`E2E 过去 ${id}`);
  await page.evaluate(() => localStorage.removeItem("tutorial-draft:new"));
});

test("toolbar buttons leave the cursor in the editor so typing continues", async ({ page }) => {
  await page.goto("/admin/tutorials/new");
  await page.locator(".ProseMirror").click();
  await page.keyboard.type("intro");
  await page.keyboard.press("Enter");
  // 模拟繁忙的机器：Tiptap 把焦点还给编辑器要等下一帧，这里把动画帧推迟 500ms
  await page.evaluate(() => {
    const raf = window.requestAnimationFrame.bind(window);
    window.requestAnimationFrame = (callback) => window.setTimeout(() => raf(callback), 500);
  });
  await page.getByRole("button", { name: "代码块" }).click();
  // 紧接着打字（含空格）：按钮不抢焦点时，文字进代码块，空格也不会再按一次按钮
  await page.keyboard.type("SELECT 1;");
  await expect(page.locator(".ProseMirror pre code")).toHaveText("SELECT 1;");
  await page.evaluate(() => localStorage.removeItem("tutorial-draft:new"));
});
