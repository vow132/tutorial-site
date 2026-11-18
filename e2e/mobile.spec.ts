import { devices, expect, test } from "@playwright/test";
import { ADMIN_STATE, collectErrors } from "./helpers";

test.use({ ...devices["Pixel 7"] });

/**
 * 抽屉面板用 transform 移入/移出视口，这里看面板左边是否回到了 0。
 * 关闭时整个抽屉是 aria-hidden，按角色找不到，所以用类名定位。
 */
const panelLeft = (page: import("@playwright/test").Page, selector: string) =>
  page.locator(selector).evaluate((element) => Math.round(element.getBoundingClientRect().left));
const drawerOpen = async (page: import("@playwright/test").Page) =>
  (await panelLeft(page, ".mobile-drawer-panel")) === 0;

test("the mobile menu opens and closes by touch and keyboard", async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto("/");
  const trigger = page.getByRole("button", { name: "打开菜单" });

  await trigger.click();
  await expect.poll(() => drawerOpen(page)).toBe(true);
  await expect(trigger).toHaveAttribute("aria-expanded", "true");
  await expect(page.getByRole("button", { name: "关闭菜单" }).last()).toBeFocused();

  await page.keyboard.press("Escape");
  await expect.poll(() => drawerOpen(page)).toBe(false);
  await expect(trigger).toBeFocused();

  await page.keyboard.press("Enter");
  await expect.poll(() => drawerOpen(page)).toBe(true);
  await page.keyboard.press("Enter");
  await expect.poll(() => drawerOpen(page)).toBe(false);
  expect(errors).toEqual([]);
});

test("the in-page table of contents expands on phones", async ({ page }) => {
  await page.goto("/tutorials/css-flexbox-guide");
  const toc = page.getByRole("button", { name: /本页目录/ });
  const panel = page.getByRole("navigation", { name: "本页目录" });
  await expect(panel).toBeHidden();
  await toc.click();
  await expect(toc).toHaveAttribute("aria-expanded", "true");
  await expect(panel).toBeVisible();
  await panel.getByRole("link").nth(1).click();
  await expect.poll(() => decodeURIComponent(new URL(page.url()).hash)).toBe("#容器与项目");
});

test.describe("before scripts load", () => {
  test.use({ javaScriptEnabled: false });

  test("the mobile menu still opens with a tap", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "打开菜单" }).click();
    await expect.poll(() => drawerOpen(page)).toBe(true);
  });
});

test.describe("admin", () => {
  test.use({ storageState: ADMIN_STATE });

  test("the admin menu opens and closes", async ({ page }) => {
    await page.goto("/admin");
    const left = () => panelLeft(page, ".admin-mobile-drawer-panel");
    await page.getByRole("button", { name: "打开后台菜单" }).click();
    await expect.poll(left).toBe(0);
    await page.getByRole("button", { name: "关闭后台菜单" }).last().click();
    await expect.poll(left).toBeLessThan(0);
  });
});
