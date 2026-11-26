import { existsSync, readdirSync } from "node:fs";
import path from "node:path";
import { expect, test } from "@playwright/test";
import sharp from "sharp";
import { ADMIN_STATE, collectErrors, createTutorialViaForm, deleteTutorialRow, uniqueSuffix, writeDatabase } from "./helpers";

test.use({ storageState: ADMIN_STATE });

const uploads = path.join(process.cwd(), "public", "uploads");

/*
 * 图片库：上传的图片都在这里，显示被哪里引用；能在编辑器里复用；没被引用的可以删除（移到 uploads/.trash/）。
 */
test("the media library lists uploads with where they are used, reuses them in the editor, and deletes unused ones", async ({ page }) => {
  const errors = collectErrors(page);
  const id = uniqueSuffix();
  const title = `e2e-图片库-${id}`;
  const slug = `e2e-media-${id}`;
  const png = await sharp({ create: { width: 64, height: 48, channels: 3, background: "#6366f1" } }).png().toBuffer();
  const upload = await page.request.post("/api/upload", { multipart: { file: { name: `e2e-${id}.png`, mimeType: "image/png", buffer: png } } });
  expect(upload.status()).toBe(200);
  const { url } = (await upload.json()) as { url: string };
  const name = url.replace("/uploads/", "");
  const card = page.getByRole("listitem").filter({ hasText: name });

  try {
    // 刚上传、还没用：没被引用（7 天内上传），可以删除
    await page.goto(`/admin/media?q=${encodeURIComponent(name)}`);
    await expect(card).toContainText(/没被引用（\d+ 天内上传）/);
    await expect(card.getByRole("button", { name: "删除" })).toBeVisible();

    // 编辑器里「图片库」：搜到这张，点一下插进正文
    await page.goto("/admin/tutorials/new");
    await page.locator(".ProseMirror").click();
    await page.getByRole("button", { name: "图片库" }).click();
    const dialog = page.getByRole("dialog", { name: "从图片库插入" });
    await dialog.getByLabel("按文件名搜索").fill(name);
    await dialog.getByRole("button", { name }).click();
    await expect(dialog).toBeHidden();
    await expect(page.locator(`.ProseMirror img[src="${url}"]`)).toHaveCount(1);

    // 用进教程以后：显示用在哪篇，不能删
    await createTutorialViaForm(page, { title, slug });
    writeDatabase('UPDATE "Tutorial" SET content = ? WHERE slug = ?', `<p>正文</p><p><img src="${url}" alt=""></p>`, slug);
    await page.goto(`/admin/media?q=${encodeURIComponent(name)}`);
    await expect(card.getByRole("link", { name: title })).toBeVisible();
    await expect(card.getByRole("button", { name: "删除" })).toHaveCount(0);
    await page.goto("/admin/media?filter=unused");
    await expect(page.getByText(name)).toHaveCount(0);

    // 教程删掉以后又没人用了：删除，文件进回收目录
    await deleteTutorialRow(page, title);
    await page.goto(`/admin/media?q=${encodeURIComponent(name)}`);
    page.once("dialog", (confirm) => confirm.accept());
    await card.getByRole("button", { name: "删除" }).click();
    await expect(card).toHaveCount(0);
    expect(existsSync(path.join(uploads, name))).toBe(false);
    const trashed = readdirSync(path.join(uploads, ".trash")).some((stamp) => existsSync(path.join(uploads, ".trash", stamp, name)));
    expect(trashed).toBe(true);
    expect(errors).toEqual([]);
  } finally {
    await deleteTutorialRow(page, title);
  }
});
