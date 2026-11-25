import { expect, test } from "@playwright/test";
import { ADMIN_STATE, collectErrors } from "./helpers";

test.use({ storageState: ADMIN_STATE });

test("site owners can add their own links to the top navigation", async ({ page }) => {
  const errors = collectErrors(page);
  const save = async () => {
    await page.getByRole("button", { name: "保存设置" }).click();
  };
  await page.goto("/admin/settings");
  const add = page.getByRole("button", { name: "+ 添加导航链接" });

  try {
    // 不安全的地址：说明哪里不对，不保存
    await add.click();
    await page.getByLabel("第 1 个导航链接的文字").fill("坏链接");
    await page.getByLabel("第 1 个导航链接的地址").fill("javascript:alert(1)");
    await save();
    await expect(page.getByText(/第 1 个导航链接的地址只能是/)).toBeVisible();

    await page.getByLabel("第 1 个导航链接的文字").fill("E2E 关于");
    await page.getByLabel("第 1 个导航链接的地址").fill("/about");
    await add.click();
    await page.getByLabel("第 2 个导航链接的文字").fill("E2E 社区");
    await page.getByLabel("第 2 个导航链接的地址").fill("https://example.com/community");
    await page.getByLabel("放在分类前面").check();
    await save();
    await expect(page.getByText("设置已保存，前台已生效")).toBeVisible();

    // 桌面导航：紧跟在「全部教程」后面，外部网址在新标签页打开
    await page.goto("/");
    const desktop = page.locator("header nav").first();
    await expect(desktop.getByRole("link", { name: "E2E 关于" })).toHaveAttribute("href", "/about");
    const external = desktop.getByRole("link", { name: "E2E 社区" });
    await expect(external).toHaveAttribute("href", "https://example.com/community");
    await expect(external).toHaveAttribute("target", "_blank");
    await expect(external).toHaveAttribute("rel", /noopener/);
    expect((await desktop.getByRole("link").allTextContents()).slice(0, 4).map((text) => text.trim())).toEqual([
      "首页",
      "全部教程",
      "E2E 关于",
      "E2E 社区",
    ]);

    // 手机菜单里同样有
    await page.setViewportSize({ width: 390, height: 844 });
    await page.reload();
    await page.getByRole("button", { name: "打开菜单" }).click();
    await expect(page.getByRole("link", { name: "E2E 社区" })).toBeVisible();
    await page.setViewportSize({ width: 1280, height: 720 });

    // 后台表单保留已保存的值
    await page.goto("/admin/settings");
    await expect(page.getByLabel("第 2 个导航链接的地址")).toHaveValue("https://example.com/community");
    await expect(page.getByLabel("放在分类前面")).toBeChecked();
    expect(errors).toEqual([]);
  } finally {
    await page.goto("/admin/settings");
    const remove = page.getByRole("button", { name: /^删除第 \d+ 个导航链接$/ });
    while (await remove.count()) await remove.first().click();
    await page.getByLabel("放在分类后面").check();
    await save();
    await expect(page.getByText("设置已保存，前台已生效")).toBeVisible();
  }
});
