import { rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { expect, test } from "@playwright/test";
import sharp from "sharp";
import { ADMIN_STATE, collectErrors, uniqueSuffix } from "./helpers";

test.use({ storageState: ADMIN_STATE });

test("by default the site uses a generated share image, a letter icon and a web manifest", async ({ page, request }) => {
  await page.goto("/");
  const content = (await page.locator('meta[property="og:image"]').getAttribute("content"))!;
  expect(content).toMatch(/\/og\/site\?v=[\w-]{12}$/);
  await expect(page.locator('meta[name="twitter:image"]')).toHaveAttribute("content", content);

  const url = new URL(content);
  const image = await request.get(url.pathname + url.search);
  expect(image.status()).toBe(200);
  expect(image.headers()["content-type"]).toBe("image/png");
  expect(image.headers()["cache-control"]).toContain("immutable");
  const meta = await sharp(await image.body()).metadata();
  expect([meta.width, meta.height]).toEqual([1200, 630]);
  expect((await request.get("/og/site?v=old")).headers()["cache-control"]).toBe("public, max-age=300");

  // 没上传网站图标：按 Logo 文字和主题色生成字母图标，/favicon.ico 和它一致
  const icon = (await page.locator('link[rel="icon"]').first().getAttribute("href"))!;
  expect(icon).toMatch(/^\/brand\/icon\?s=32&v=l-[\w-]+$/);
  const png = await request.get(icon);
  expect(png.headers()["content-type"]).toBe("image/png");
  expect(png.headers()["cache-control"]).toContain("immutable");
  const iconMeta = await sharp(await png.body()).metadata();
  expect([iconMeta.width, iconMeta.height]).toEqual([32, 32]);
  const favicon = await request.get("/favicon.ico");
  expect(favicon.status()).toBe(200);
  expect(favicon.headers()["content-type"]).toBe("image/png");
  const large = await sharp(await (await request.get("/brand/icon?s=512")).body()).metadata();
  expect([large.width, large.height]).toEqual([512, 512]);

  // 网站清单：站名和 192 / 512 图标
  const manifestHref = (await page.locator('link[rel="manifest"]').getAttribute("href"))!;
  const manifest = (await (await request.get(manifestHref)).json()) as { name: string; start_url: string; icons: Array<{ src: string; sizes: string }> };
  expect(manifest.name).toBeTruthy();
  expect(manifest.start_url).toBe("/");
  expect(manifest.icons.map((item) => item.sizes)).toEqual(["192x192", "512x512"]);
  expect(manifest.icons[0].src).toMatch(/^\/brand\/icon\?s=192&v=l-/);
  // 默认主题色不注入覆盖样式，吉祥物照常显示
  expect((await page.locator("head style").allTextContents()).some((css) => css.includes("--color-accent"))).toBe(false);
  await expect(page.locator("html")).not.toHaveAttribute("data-mascot", "off");
  await expect(page.locator("footer")).toContainText("持续更新中");
});

test("logo, favicon, share image, accent colour, mascot and footer status come from brand settings", async ({ page, request }) => {
  const errors = collectErrors(page);
  const id = uniqueSuffix();
  const logo = path.join(os.tmpdir(), `logo-${id}.png`);
  const share = path.join(os.tmpdir(), `share-${id}.png`);
  await sharp({ create: { width: 256, height: 256, channels: 3, background: "#0ea5e9" } }).png().toFile(logo);
  await sharp({ create: { width: 1200, height: 630, channels: 3, background: "#f97316" } }).png().toFile(share);
  const input = (name: string) => page.locator(`input[name="${name}"]`);

  try {
    await page.goto("/admin/settings");
    await page.getByLabel("上传Logo 图片").setInputFiles(logo);
    await expect(page.getByAltText("Logo 图片预览")).toBeVisible();
    await page.getByLabel("上传网站图标").setInputFiles(logo);
    await expect(page.getByAltText("网站图标预览")).toBeVisible();
    await page.getByLabel("上传默认分享图").setInputFiles(share);
    await expect(page.getByAltText("默认分享图预览")).toBeVisible();
    await input("brand.accentColor").fill("#0EA5E9");
    await page.getByLabel(/显示小幽灵吉祥物/).uncheck();
    await input("footerStatus").fill("E2E 状态");
    await page.getByRole("button", { name: "保存设置" }).click();
    await expect(page.getByText("设置已保存，前台已生效")).toBeVisible();
    const shareUrl = await input("brand.shareImage").inputValue();
    expect(shareUrl).toMatch(/^\/uploads\/[\w-]+\.webp$/);

    await page.goto("/");
    await expect(page.locator("header img").first()).toHaveAttribute("src", /^\/uploads\/[\w-]+\.webp$/);
    const css = (await page.locator("head style").allTextContents()).find((text) => text.includes("--color-accent")) ?? "";
    expect(css).toContain("--color-accent:#0ea5e9");
    expect(css).toContain('html:root[data-theme="dark"]');
    await expect(page.locator("html")).toHaveAttribute("data-mascot", "off");
    await expect(page.locator(".site-mascot").first()).toBeHidden();
    await expect(page.locator("footer")).toContainText("E2E 状态");
    await expect(page.locator('meta[property="og:image"]')).toHaveAttribute("content", new RegExp(`${shareUrl}$`));

    const icon = (await page.locator('link[rel="icon"]').first().getAttribute("href"))!;
    // 上传的图标：版本号是文件名，不再是字母图标
    expect(icon).toMatch(/^\/brand\/icon\?s=32&v=(?!l-)[\w-]+$/);
    const png = await request.get(icon);
    expect(png.headers()["content-type"]).toBe("image/png");
    expect(png.headers()["cache-control"]).toContain("immutable");
    const meta = await sharp(await png.body()).metadata();
    expect([meta.width, meta.height]).toEqual([32, 32]);
    await expect(page.locator('link[rel="apple-touch-icon"]')).toHaveAttribute("href", /\/brand\/icon\?s=180&v=/);
    expect((await request.get("/brand/icon?s=64")).status()).toBe(404);
    expect(errors).toEqual([]);
  } finally {
    await page.goto("/admin/settings");
    const remove = page.getByRole("button", { name: "移除" });
    while (await remove.count()) await remove.first().click();
    await input("brand.accentColor").fill("");
    await page.getByLabel(/显示小幽灵吉祥物/).check();
    await input("footerStatus").fill("持续更新中");
    await page.getByRole("button", { name: "保存设置" }).click();
    await expect(page.getByText("设置已保存，前台已生效")).toBeVisible();
    await rm(logo, { force: true });
    await rm(share, { force: true });
  }
});

test("brand settings reject a malformed accent colour", async ({ page }) => {
  await page.goto("/admin/settings");
  await page.locator('input[name="brand.accentColor"]').fill("blue");
  await page.getByRole("button", { name: "保存设置" }).click();
  await expect(page.getByText(/RRGGBB/)).toBeVisible();
  await page.goto("/");
  expect((await page.locator("head style").allTextContents()).some((css) => css.includes("--color-accent"))).toBe(false);
});

test("the dashboard shows the running version and a launch checklist", async ({ page }) => {
  await page.goto("/admin");
  await expect(page.locator(".admin-version:visible")).toHaveText(/^v\d+\.\d+\.\d+( · [0-9a-f]{7})?$/);
  const checklist = page.locator("details.launch-checklist");
  await expect(checklist.locator("summary")).toContainText("上线检查清单");
  await expect(checklist.locator("li")).toHaveCount(9);
  // 种子数据还在，所以「清除示例教程」没完成，旁边有清除按钮
  await expect(checklist.getByText("未完成：清除示例教程")).toBeAttached();
  await expect(checklist.getByRole("button", { name: "一键清除示例数据" })).toBeVisible();
});
