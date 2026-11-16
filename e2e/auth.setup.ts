import { expect, test as setup } from "@playwright/test";
import { ADMIN_STATE, admin } from "./helpers";

setup("log in as admin", async ({ page }) => {
  await page.goto("/admin/login");
  await page.fill('input[name="username"]', admin.username);
  await page.fill('input[name="password"]', admin.password);
  await page.getByRole("button", { name: /^登\s*录$/ }).click();
  // 弱密码（如开发默认的 admin123456、CI 种子密码）登录成功后会被带到改密页，
  // 会话同样有效，不影响后续测试。
  await expect(page).toHaveURL(/\/admin(\/account\?weak=1)?$/);
  await page.context().storageState({ path: ADMIN_STATE });
});
