import { expect, test as setup } from "@playwright/test";
import { ADMIN_STATE, admin } from "./helpers";

setup("log in as admin", async ({ page }) => {
  await page.goto("/admin/login");
  await page.fill('input[name="username"]', admin.username);
  await page.fill('input[name="password"]', admin.password);
  await page.getByRole("button", { name: /登\s*录/ }).click();
  await expect(page).toHaveURL(/\/admin$/);
  await page.context().storageState({ path: ADMIN_STATE });
});
