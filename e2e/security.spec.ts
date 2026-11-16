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
  await page.getByRole("button", { name: /^登\s*录$/ }).click();
  await expect(page.getByText("用户名或密码错误")).toBeVisible();
  await expect(page).toHaveURL(/\/admin\/login/);
});

test("a burst of distinct searches is capped site-wide, then recovers", async ({ request }) => {
  const stamp = Date.now();
  const bodies = [];
  for (let i = 0; i < 30; i++) {
    const response = await request.get(`/search?q=${encodeURIComponent(`burst-${stamp}-${i}`)}`);
    expect(response.status()).toBe(200);
    bodies.push(await response.text());
  }
  expect(bodies.some((body) => body.includes("搜索的人有点多"))).toBe(true);

  // 预算窗口是 5 秒：等它恢复，不影响之后的测试。
  await expect
    .poll(async () => (await (await request.get(`/search?q=recover-${stamp}`)).text()).includes("搜索的人有点多"), {
      timeout: 8_000,
      intervals: [1_000],
    })
    .toBe(false);
});
