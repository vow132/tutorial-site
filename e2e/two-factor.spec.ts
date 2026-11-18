import { expect, test, type Page } from "@playwright/test";
import { currentTotpStep, totpCode } from "../lib/totp";
import { ADMIN_STATE, admin, queryDatabase } from "./helpers";

/**
 * 两步验证 + 恢复码的完整流程。测试结束前一定关掉两步验证，
 * 否则后续用密码登录的测试会卡在验证码这一步。
 */
test.describe.serial("two-factor recovery codes", () => {
  test.use({ storageState: ADMIN_STATE });

  let codes: string[] = [];

  async function loginWith(page: Page, second: string) {
    await page.goto("/admin/login");
    await page.fill('input[name="username"]', admin.username);
    await page.fill('input[name="password"]', admin.password);
    await page.getByRole("button", { name: /^登\s*录$/ }).click();
    await page.getByLabel("两步验证码").fill(second);
    await page.getByRole("button", { name: /^验\s*证$/ }).click();
  }

  test("enabling 2FA stores the secret encrypted and shows recovery codes once", async ({ page }) => {
    await page.goto("/admin/account");
    const secret = (await page.locator("code").filter({ hasText: /^[A-Z2-7 ]{20,}$/ }).innerText()).replace(/\s/g, "");
    await page.locator('form:has(input[name="setup"]) input[name="currentPassword"]').fill(admin.password);
    await page.locator('form:has(input[name="setup"]) input[name="code"]').fill(totpCode(secret, currentTotpStep()));
    await page.getByRole("button", { name: "开启两步验证" }).click();

    const panel = page.getByRole("region", { name: "恢复码" });
    await expect(panel).toBeVisible();
    codes = await panel.getByRole("listitem").allInnerTexts();
    expect(codes).toHaveLength(10);
    for (const code of codes) expect(code).toMatch(/^[a-z2-7]{4}(-[a-z2-7]{4}){3}$/);

    const row = queryDatabase<{ totpSecret: string }>('SELECT "totpSecret" FROM "Admin" WHERE "username" = ?', admin.username)!;
    expect(row.totpSecret).toMatch(/^enc:v1:/);
    expect(row.totpSecret).not.toContain(secret);

    await panel.getByRole("button", { name: "我已保存好" }).click();
    await expect(page.getByText("恢复码：剩余 10 个")).toBeVisible();
  });

  test("a recovery code logs in once and cannot be reused", async ({ browser }) => {
    const context = await browser.newContext({ storageState: { cookies: [], origins: [] } });
    const page = await context.newPage();
    await loginWith(page, codes[0].toUpperCase());
    await expect(page).toHaveURL(/\/admin(\/account\?weak=1)?$/);

    const again = await browser.newContext({ storageState: { cookies: [], origins: [] } });
    const second = await again.newPage();
    await loginWith(second, codes[0]);
    await expect(second.getByText("验证码或恢复码不正确，或已被使用")).toBeVisible();
    await context.close();
    await again.close();
  });

  test("2FA can be turned off with a recovery code, which removes the remaining codes", async ({ page }) => {
    await page.goto("/admin/account");
    await expect(page.getByText("恢复码：剩余 9 个")).toBeVisible();
    const disable = page.locator("form").filter({ has: page.getByRole("button", { name: "关闭两步验证" }) });
    await disable.locator('input[name="currentPassword"]').fill(admin.password);
    await disable.locator('input[name="code"]').fill(codes[1]);
    await disable.getByRole("button", { name: "关闭两步验证" }).click();
    // 关闭后页面刷新为「开启」表单
    await expect(page.getByRole("button", { name: "开启两步验证" })).toBeVisible();
    const left = queryDatabase<{ n: number }>(
      'SELECT COUNT(*) AS n FROM "AdminRecoveryCode" r JOIN "Admin" a ON a.id = r."adminId" WHERE a."username" = ?',
      admin.username,
    )!;
    expect(left.n).toBe(0);
  });

  test.afterAll(async ({ browser }) => {
    // 保险：上面某一步失败时也要把两步验证关掉，免得影响其他测试。
    const enabled = queryDatabase<{ totpSecret: string | null }>(
      'SELECT "totpSecret" FROM "Admin" WHERE "username" = ?',
      admin.username,
    )?.totpSecret;
    if (!enabled || codes.length < 3) return;
    const context = await browser.newContext({ storageState: ADMIN_STATE });
    const page = await context.newPage();
    await page.goto("/admin/account");
    const disable = page.locator("form").filter({ has: page.getByRole("button", { name: "关闭两步验证" }) });
    await disable.locator('input[name="currentPassword"]').fill(admin.password);
    await disable.locator('input[name="code"]').fill(codes[2]);
    await disable.getByRole("button", { name: "关闭两步验证" }).click();
    await context.close();
  });
});

test.describe("security.txt", () => {
  test.use({ storageState: ADMIN_STATE });

  test("is served only after a contact is configured", async ({ page, request }) => {
    expect((await request.get("/.well-known/security.txt")).status()).toBe(404);

    await page.goto("/admin/settings");
    await page.fill('input[name="securityContact"]', "not a contact");
    await page.getByRole("button", { name: "保存设置" }).click();
    await expect(page.getByText("安全联系方式请填写邮箱")).toBeVisible();

    await page.fill('input[name="securityContact"]', "security@example.com");
    await page.getByRole("button", { name: "保存设置" }).click();
    await expect(page.getByText("设置已保存")).toBeVisible();
    const response = await request.get("/.well-known/security.txt");
    expect(response.status()).toBe(200);
    expect(response.headers()["content-type"]).toContain("text/plain");
    const body = await response.text();
    expect(body).toContain("Contact: mailto:security@example.com");
    expect(body).toMatch(/^Expires: \d{4}-\d{2}-\d{2}T00:00:00\.000Z$/m);
    expect(body).toMatch(/^Canonical: https?:\/\/[^\n]+\/\.well-known\/security\.txt$/m);

    await page.fill('input[name="securityContact"]', "");
    await page.getByRole("button", { name: "保存设置" }).click();
    await expect(page.getByText("设置已保存")).toBeVisible();
    expect((await request.get("/.well-known/security.txt")).status()).toBe(404);
  });
});
