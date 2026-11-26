import { readFile } from "node:fs/promises";
import { expect, test, type Browser, type Request } from "@playwright/test";
import { ADMIN_STATE, collectErrors, createTutorialViaForm, deleteTutorialRow, queryDatabase, uniqueSuffix } from "./helpers";

/** 普通浏览器的 UA：Playwright 自带的 HeadlessChrome 会被当作爬虫，不计入统计。 */
const DESKTOP_UA =
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36";

const reader = (browser: Browser) => browser.newContext({ userAgent: DESKTOP_UA });

/** 上报请求的 JSON 正文（测试里关掉了 sendBeacon，走同样内容的 fetch，Playwright 才看得到正文）。 */
const beaconBody = (request: Request) => request.postData() ?? "";

test.describe("admin", () => {
  test.use({ storageState: ADMIN_STATE });

  test("searches are counted and the ones with no results become a topic list", async ({ page, browser }) => {
    const id = uniqueSuffix();
    const missing = `没有这篇教程${id}`;
    const context = await reader(browser);
    const visitor = await context.newPage();
    // 搜 3 次：仪表盘只列次数最多的前 10 个，库里已有别的只搜过 1 次的词时也能排进去
    for (let i = 0; i < 3; i++) {
      await visitor.goto(`/search?q=${encodeURIComponent(missing)}`);
      await expect(visitor.getByText("没有找到相关教程")).toBeVisible();
    }
    await visitor.goto(`/search?q=${encodeURIComponent("Flexbox")}`);
    await context.close();

    // 统计每 5 秒批量写一次库
    const section = page.locator('section[aria-labelledby="search-heading"]');
    await expect
      .poll(async () => {
        await page.goto("/admin");
        return section.textContent();
      }, { timeout: 20_000, intervals: [1000] })
      .toContain(missing);
    const missingCard = section.locator("div").filter({ hasText: "没找到结果的搜索" }).last();
    await expect(missingCard.getByRole("link", { name: missing })).toHaveAttribute("href", `/search?q=${encodeURIComponent(missing)}`);
    await expect(section.getByRole("link", { name: "flexbox" })).toBeVisible();
  });

  test("traffic sources and read completions are recorded", async ({ page, browser }) => {
    const id = uniqueSuffix();
    const title = `E2E 来源 ${id}`;
    const slug = `e2e-source-${id}`;
    try {
      await createTutorialViaForm(page, { title, slug });
      const tutorialId = queryDatabase<{ id: number }>('SELECT "id" FROM "Tutorial" WHERE "slug" = ?', slug)!.id;
      const context = await reader(browser);
      const visitor = await context.newPage();
      const errors = collectErrors(visitor);
      const view = visitor.waitForRequest((req) => req.url().endsWith("/api/views") && !beaconBody(req).includes('"read"'));
      // 模拟从百度搜索结果点进来（测试服务器是 http，浏览器不会把 https 来源带过来，所以直接设定 document.referrer）
      await visitor.addInitScript(() => {
        Object.defineProperty(document, "referrer", { get: () => "https://www.baidu.com/s?wd=e2e" });
        // sendBeacon 的请求正文 Playwright 读不到；关掉后组件退回 fetch，发送的 JSON 完全一样
        Object.defineProperty(navigator, "sendBeacon", { value: undefined });
      });
      await visitor.goto(`/tutorials/${slug}`);
      expect(JSON.parse(beaconBody(await view))).toEqual({ id: tutorialId, ref: "www.baidu.com" });

      // 正文很短，一打开末尾就在屏幕里：停留满 10 秒后上报一次「读完」
      const read = await visitor.waitForRequest((req) => req.url().endsWith("/api/views") && beaconBody(req).includes('"read"'), {
        timeout: 15_000,
      });
      expect(JSON.parse(beaconBody(read))).toEqual({ id: tutorialId, read: true });
      // 同时记进本浏览器的阅读进度（系列的「已读」「继续阅读」用它）
      expect(JSON.parse((await visitor.evaluate(() => localStorage.getItem("tutorial-site-read"))) ?? "[]")).toContain(tutorialId);
      expect(errors).toEqual([]);
      await context.close();

      await expect
        .poll(() => queryDatabase<{ views: number; completions: number }>('SELECT SUM("views") AS views, SUM("completions") AS completions FROM "TutorialDailyView" WHERE "tutorialId" = ?', tutorialId), {
          timeout: 10_000,
        })
        .toEqual({ views: 1, completions: 1 });
      await page.goto("/admin");
      const sources = page.locator('section[aria-labelledby="sources-heading"]');
      await expect(sources).toContainText("百度");
      await expect(sources).toContainText("搜索引擎");
    } finally {
      await deleteTutorialRow(page, title);
    }
  });

  test("readers can leave a note after 'not helpful', and it lands in the admin inbox", async ({ page, browser }) => {
    const id = uniqueSuffix();
    const title = `E2E 留言 ${id}`;
    const slug = `e2e-note-${id}`;
    const note = `第三步的命令报错了 ${id}`;
    try {
      await createTutorialViaForm(page, { title, slug });
      const context = await reader(browser);
      const visitor = await context.newPage();
      await visitor.goto(`/tutorials/${slug}`);
      const section = visitor.locator("section.helpful-feedback");
      await section.getByRole("button", { name: "没帮助" }).click();
      await section.getByLabel(/哪里没讲清楚/).fill(note);
      const sent = visitor.waitForResponse((res) => res.url().endsWith("/api/feedback/message"));
      await section.getByRole("button", { name: "发送" }).click();
      expect((await sent).status()).toBe(204);
      await expect(section.getByRole("status")).toHaveText("收到了，谢谢你花时间写下来！");
      await expect(section.getByLabel(/哪里没讲清楚/)).toHaveCount(0);
      await context.close();

      await page.goto("/admin");
      await expect(page.getByRole("link", { name: /条未读的读者留言/ })).toBeVisible();
      await page.goto("/admin/feedback");
      const item = page.getByRole("listitem").filter({ hasText: note });
      await expect(item).toContainText(title);
      await expect(item).toContainText("未读");
      await item.getByRole("button", { name: "标为已读" }).click();
      await expect(page.getByRole("listitem").filter({ hasText: note })).toHaveCount(0);
      await page.goto("/admin/feedback?show=all");
      page.once("dialog", (dialog) => dialog.accept());
      await page.getByRole("listitem").filter({ hasText: note }).getByRole("button", { name: "删除" }).click();
      await expect(page.getByRole("listitem").filter({ hasText: note })).toHaveCount(0);
    } finally {
      await deleteTutorialRow(page, title);
    }
  });

  test("tutorials can be imported from and exported to Markdown", async ({ page }) => {
    const errors = collectErrors(page);
    const id = uniqueSuffix();
    const title = `E2E Markdown ${id}`;
    const slug = `e2e-markdown-${id}`;
    const markdown = [
      "---",
      `title: "${title}"`,
      `slug: ${slug}`,
      "description: 从 Markdown 导入的教程",
      "tags: [E2E导入, SQL]",
      "---",
      "",
      "## 查询",
      "",
      "```sql",
      "SELECT 1;",
      "```",
      "",
      "> [!WARNING]",
      "> 先备份数据库",
      "",
    ].join("\n");
    try {
      await page.goto("/admin/tutorials/new");
      await page.locator(".ProseMirror").waitFor();
      await page.locator('select[name="categoryId"]').selectOption({ index: 1 });
      await page.getByText("从 Markdown 导入").click();
      await page.getByLabel("或者粘贴 Markdown").fill(markdown);
      await page.getByRole("button", { name: "导入粘贴的内容" }).click();
      await expect(page.locator('input[name="title"]')).toHaveValue(title);
      await expect(page.locator('input[name="slug"]')).toHaveValue(slug);
      await expect(page.locator('textarea[name="excerpt"]')).toHaveValue("从 Markdown 导入的教程");
      // 导入前选好的分类保留
      await expect(page.locator('select[name="categoryId"]')).not.toHaveValue("");
      await expect(page.locator('.ProseMirror pre code[class*="language-sql"]')).toHaveText("SELECT 1;");
      await expect(page.locator('.ProseMirror [data-callout="warning"]')).toContainText("先备份数据库");
      await page.getByRole("button", { name: "保存教程" }).click();
      await expect(page).toHaveURL(/\/admin\/tutorials(\?saved=[\w-]+)?$/);

      await page.goto(`/tutorials/${slug}`);
      await expect(page.locator(".article-body .code-lang")).toHaveText("SQL");
      await expect(page.getByRole("list", { name: "标签" })).toContainText("#E2E导入");

      const tutorialId = queryDatabase<{ id: number }>('SELECT "id" FROM "Tutorial" WHERE "slug" = ?', slug)!.id;
      await page.goto(`/admin/tutorials/${tutorialId}`);
      const download = page.waitForEvent("download");
      await page.getByRole("link", { name: "导出 Markdown" }).click();
      const file = await download;
      expect(file.suggestedFilename()).toBe(`${slug}.md`);
      const exported = await readFile((await file.path())!, "utf8");
      expect(exported).toContain(`title: ${title}\n`);
      expect(exported).toContain("tags: [E2E导入, SQL]");
      expect(exported).toContain("```sql\nSELECT 1;\n```");
      expect(exported).toContain("> [!WARNING]\n> 先备份数据库");
      expect(errors).toEqual([]);
    } finally {
      await page.evaluate(() => localStorage.removeItem("tutorial-draft:new")).catch(() => undefined);
      await deleteTutorialRow(page, title);
    }
  });
});

test("articles can be shared by link or WeChat QR code", async ({ page, context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  const errors = collectErrors(page);
  await page.goto("/tutorials/css-flexbox-guide");
  const share = page.locator(".share-buttons");
  await share.getByRole("button", { name: "复制链接" }).click();
  await expect(share.getByRole("status")).toHaveText("链接已复制");
  expect(await page.evaluate(() => navigator.clipboard.readText())).toMatch(/\/tutorials\/css-flexbox-guide$/);

  await share.getByRole("button", { name: "微信扫码" }).click();
  await expect(share.getByRole("img", { name: "本文地址的二维码" })).toBeVisible();
  await expect(share.getByRole("button", { name: "微信扫码" })).toHaveAttribute("aria-expanded", "true");
  await page.keyboard.press("Escape");
  await expect(share.getByRole("img", { name: "本文地址的二维码" })).toHaveCount(0);
  expect(errors).toEqual([]);
});

test("reader endpoints reject cross-site and malformed requests", async ({ request }) => {
  const crossSite = await request.post("/api/feedback/message", {
    headers: { "sec-fetch-site": "cross-site" },
    data: { id: 1, message: "跨站留言" },
  });
  expect(crossSite.status()).toBe(403);
  expect((await request.post("/api/feedback/message", { data: { id: 1, message: " " } })).status()).toBe(400);
  expect((await request.post("/api/feedback/message", { data: { id: "x", message: "正常留言" } })).status()).toBe(400);
  // 阅读上报：read 必须是 true 才算读完；id 不合法照旧 400
  expect((await request.post("/api/views", { data: { id: "x", read: true } })).status()).toBe(400);
  expect((await request.post("/api/views", { data: { id: 1, ref: "https://evil.example/path" } })).status()).toBe(204);
});
