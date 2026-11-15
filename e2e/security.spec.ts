import { expect, test } from "@playwright/test";

test("admin pages require a session", async ({ page }) => {
  await page.goto("/admin/tutorials");
  await expect(page).toHaveURL(/\/admin\/login/);
});

test("uploads require a session", async ({ request }) => {
  const response = await request.post("/api/upload", {
    multipart: { file: { name: "a.png", mimeType: "image/png", buffer: Buffer.from("x") } },
  });
  expect(response.status()).toBe(401);
});

test("security headers are sent", async ({ request }) => {
  const headers = (await request.get("/")).headers();
  expect(headers["content-security-policy"]).toContain("default-src 'self'");
  expect(headers["x-content-type-options"]).toBe("nosniff");
  expect(headers["x-frame-options"]).toBe("DENY");
});

test("a wrong password is rejected", async ({ page }) => {
  await page.goto("/admin/login");
  await page.fill('input[name="username"]', "e2e-nobody");
  await page.fill('input[name="password"]', "definitely-wrong-password");
  await page.getByRole("button", { name: /登\s*录/ }).click();
  await expect(page.getByText("用户名或密码错误")).toBeVisible();
  await expect(page).toHaveURL(/\/admin\/login/);
});
