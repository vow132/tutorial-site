import { expect, test } from "@playwright/test";
import { ADMIN_STATE, createTutorialViaForm, deleteTutorialRow, uniqueSuffix, writeDatabase } from "./helpers";

test.use({ storageState: ADMIN_STATE });

const HOST = "https://img.example.test";

/*
 * 图片加速地址：前台页面里本站上传的图片改从加速地址加载，正文、链接、外部图片不动。
 * 这个测试用一个不存在的域名，只检查页面里的地址（图片本身加载失败是预期的，所以不收集控制台错误）。
 */
test("with an image host set, uploaded images on public pages load from it", async ({ page }) => {
  const id = uniqueSuffix();
  const title = `e2e-加速-${id}`;
  const slug = `e2e-asset-${id}`;
  const settingsField = page.getByLabel(/图片加速地址/);
  const save = async () => {
    await page.getByRole("button", { name: "保存设置" }).click();
  };

  try {
    await createTutorialViaForm(page, { title, slug });
    // 直接写库：正文里放一张本站上传的图片和一张外部图片，列表缩略图也是本站上传的
    writeDatabase(
      'UPDATE "Tutorial" SET content = ?, thumbnail = ? WHERE slug = ?',
      `<p>正文</p><p><img src="/uploads/e2e-${id}.webp" alt="本站图片"></p><p><img src="https://elsewhere.example/x.png" alt="外部图片"></p>`,
      `/uploads/e2e-${id}-400w.webp`,
      slug,
    );

    await page.goto("/admin/settings");
    await settingsField.fill("http://img.example.test");
    await save();
    await expect(page.getByText(/要用 https/)).toBeVisible();

    // 测试按钮：取不到图时说明要检查什么
    await settingsField.fill(HOST);
    await page.getByRole("button", { name: "测试" }).click();
    await expect(page.getByText(/取图失败|还没有上传过图片/)).toBeVisible({ timeout: 30_000 });

    await save();
    await expect(page.getByText("设置已保存，前台已生效")).toBeVisible();

    await page.goto(`/tutorials/${slug}`);
    await expect(page.getByAltText("本站图片")).toHaveAttribute("src", `${HOST}/uploads/e2e-${id}.webp`);
    await expect(page.getByAltText("外部图片")).toHaveAttribute("src", "https://elsewhere.example/x.png");
    await page.goto(`/tutorials?page=1`);
    await expect(page.locator(`img[src="${HOST}/uploads/e2e-${id}-400w.webp"]`)).toHaveCount(1);
  } finally {
    await page.goto("/admin/settings");
    await settingsField.fill("");
    await save();
    await expect(page.getByText("设置已保存，前台已生效")).toBeVisible();
    await deleteTutorialRow(page, title);
  }
  // 清空后恢复成本站地址
  await page.goto("/tutorials");
  await expect(page.locator(`img[src^="${HOST}"]`)).toHaveCount(0);
});
