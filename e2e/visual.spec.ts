import { rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { expect, test } from "@playwright/test";
import sharp from "sharp";
import { ADMIN_STATE, collectErrors, uniqueSuffix } from "./helpers";

test.describe("covers and callouts", () => {
  test.use({ storageState: ADMIN_STATE });

  test("a cover becomes the article hero, share image and list thumbnail; callouts render", async ({ page, request }) => {
    const errors = collectErrors(page);
    const id = uniqueSuffix();
    const title = `E2E 封面 ${id}`;
    const slug = `e2e-cover-${id}`;
    const file = path.join(os.tmpdir(), `cover-${id}.png`);
    await sharp({ create: { width: 1920, height: 1080, channels: 3, background: "#0ea5e9" } }).png().toFile(file);
    let cover = "";

    try {
      await page.goto("/admin/tutorials/new");
      await page.locator(".ProseMirror").waitFor();
      await page.fill('input[name="title"]', title);
      await page.fill('input[name="slug"]', slug);
      await page.locator('select[name="categoryId"]').selectOption({ index: 1 });

      await page.getByLabel("选择封面图片").setInputFiles(file);
      await expect(page.getByAltText("封面预览")).toBeVisible();
      cover = (await page.locator('input[name="cover"]').inputValue())!;
      expect(cover).toMatch(/^\/uploads\/[\w-]+\.webp$/);

      // 正文：一个「注意」提示框
      await page.locator(".ProseMirror").click();
      await page.keyboard.type("先备份数据库再升级");
      await page.getByRole("button", { name: "💡 提示框" }).click();
      await page.getByRole("menuitem", { name: "注意" }).click();
      await expect(page.locator('.ProseMirror [data-callout="warning"]')).toContainText("先备份数据库再升级");

      await page.getByRole("button", { name: "保存教程" }).click();
      await expect(page).toHaveURL(/\/admin\/tutorials$/);

      await page.goto(`/tutorials/${slug}`);
      const hero = page.locator("img.article-cover");
      await expect(hero).toHaveAttribute("src", cover);
      await expect(hero).toHaveAttribute("srcset", /-400w\.webp 400w, .*-800w\.webp 800w, .*-1200w\.webp 1200w/);
      await expect(page.locator('meta[property="og:image"]')).toHaveAttribute("content", new RegExp(`${cover}$`));
      const callout = page.locator('.article-body [data-callout="warning"]');
      await expect(callout).toContainText("先备份数据库再升级");
      expect(await callout.evaluate((element) => getComputedStyle(element, "::before").content)).toContain("注意");

      // 列表卡片用 400px 小图做缩略图
      await page.goto("/tutorials");
      const card = page.locator(`a[href="/tutorials/${slug}"]`);
      await expect(card.locator("img.card-thumb")).toHaveAttribute("src", cover.replace(/\.webp$/, "-400w.webp"));

      // 去掉封面后不再有头图和缩略图
      await page.goto("/admin/tutorials");
      await page.getByRole("row").filter({ hasText: title }).locator('a[href^="/admin/tutorials/"]').first().click();
      await page.getByRole("button", { name: "移除封面" }).click();
      await page.getByRole("button", { name: "保存教程" }).click();
      await expect(page).toHaveURL(/\/admin\/tutorials$/);
      await page.goto(`/tutorials/${slug}`);
      await expect(page.locator("img.article-cover")).toHaveCount(0);
      await page.goto("/tutorials");
      await expect(page.locator(`a[href="/tutorials/${slug}"] img.card-thumb`)).toHaveCount(0);
      expect(errors).toEqual([]);
    } finally {
      await page.goto("/admin/tutorials");
      const row = page.getByRole("row").filter({ hasText: title });
      if (await row.count()) {
        page.once("dialog", (dialog) => dialog.accept());
        await row.getByRole("button", { name: "删除" }).click();
        await expect(page.getByText(title)).toHaveCount(0);
      }
      expect((await request.get(`/tutorials/${slug}`)).status()).toBe(404);
      if (cover) {
        const base = cover.replace(/\.webp$/, "");
        await Promise.all(
          [cover, `${base}-400w.webp`, `${base}-800w.webp`, `${base}-1200w.webp`].map((url) =>
            rm(path.join(process.cwd(), "public", url), { force: true }),
          ),
        );
      }
      await rm(file, { force: true });
    }
  });

  test("covers must be files uploaded to this site", async ({ page }) => {
    await page.goto("/admin/tutorials/new");
    await page.locator(".ProseMirror").waitFor();
    await page.fill('input[name="title"]', `E2E 外链封面 ${uniqueSuffix()}`);
    await page.locator('select[name="categoryId"]').selectOption({ index: 1 });
    await page.locator(".ProseMirror").click();
    await page.keyboard.type("正文");
    await page.locator('input[name="cover"]').evaluate((input: HTMLInputElement) => {
      input.value = "https://evil.example/x.png";
    });
    await page.getByRole("button", { name: "保存教程" }).click();
    await expect(page.getByText("封面图无效或文件已不存在")).toBeVisible();
  });
});

test.describe("lite mode", () => {
  const blurOf = (page: import("@playwright/test").Page) =>
    page.locator("header .backdrop-blur-md").first().evaluate((element) => getComputedStyle(element).backdropFilter);

  test("capable devices keep the glass effects", async ({ page }) => {
    await page.addInitScript(() => {
      Object.defineProperty(navigator, "deviceMemory", { get: () => 8 });
      Object.defineProperty(navigator, "hardwareConcurrency", { get: () => 8 });
    });
    await page.goto("/");
    expect(await page.evaluate(() => document.documentElement.hasAttribute("data-lite"))).toBe(false);
    expect(await blurOf(page)).not.toBe("none");
  });

  test("low-memory devices drop blur and looping animations", async ({ page }) => {
    const errors = collectErrors(page);
    await page.addInitScript(() => {
      Object.defineProperty(navigator, "deviceMemory", { get: () => 2 });
      Object.defineProperty(navigator, "hardwareConcurrency", { get: () => 8 });
    });
    await page.goto("/");
    expect(await page.evaluate(() => document.documentElement.hasAttribute("data-lite"))).toBe(true);
    expect(await blurOf(page)).toBe("none");
    expect(await page.locator(".mascot-float").first().evaluate((element) => getComputedStyle(element).animationName)).toBe("none");
    expect(errors).toEqual([]);
  });
});
