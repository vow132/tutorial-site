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
  expect(headers["content-security-policy"]).not.toMatch(/img-src[^;]*\bhttp:/);
  expect(headers["x-content-type-options"]).toBe("nosniff");
  expect(headers["x-frame-options"]).toBe("DENY");
});

/** script-src 指令的内容 */
const scriptSrc = (csp: string | undefined) => csp?.split(";").find((part) => part.trim().startsWith("script-src")) ?? "";

test("admin pages get a strict per-request CSP: a fresh nonce, no 'unsafe-inline'", async ({ request }) => {
  const first = (await request.get("/admin/login")).headers()["content-security-policy"];
  const second = (await request.get("/admin/login")).headers()["content-security-policy"];
  expect(scriptSrc(first)).toMatch(/'nonce-[A-Za-z0-9+/=]+'/);
  expect(scriptSrc(first)).toContain("'strict-dynamic'");
  expect(scriptSrc(first)).not.toContain("'unsafe-inline'");
  expect(scriptSrc(first).match(/'nonce-[^']+'/)![0]).not.toBe(scriptSrc(second).match(/'nonce-[^']+'/)![0]);
  // 只有一条 CSP（前台那条没有叠加到后台上）
  expect(first).not.toContain(",");
});

/*
 * 模拟白名单被绕过、HTML 里混进了内联事件处理器（XSS 最常见的形式）。
 * 前台的 CSP 带 'unsafe-inline'，会执行（用来证明这个测试真的能分辨）；后台的严格 CSP 会拦下。
 */
async function injectedHandlerRuns(page: import("@playwright/test").Page) {
  await page.evaluate(() => {
    const box = document.createElement("div");
    box.innerHTML = '<img src="/e2e-missing-image.png" alt="" onerror="window.__injected = true">';
    document.body.appendChild(box);
  });
  // 图片 404 后 onerror 才会触发（如果允许执行的话）
  await page.waitForTimeout(500);
  return page.evaluate(() => (window as Window & { __injected?: boolean }).__injected === true);
}

test("an injected inline event handler runs on public pages but not on admin pages", async ({ page }) => {
  const violations: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error" && /Content Security Policy/i.test(message.text())) violations.push(message.text());
  });
  await page.goto("/");
  expect(await injectedHandlerRuns(page)).toBe(true);

  await page.goto("/admin/login");
  // 正常页面照常工作：框架脚本带 nonce，主题脚本按哈希放行（data-theme 已设置）
  await expect(page.locator("html")).toHaveAttribute("data-theme", /light|dark/);
  expect(await injectedHandlerRuns(page)).toBe(false);
  expect(violations.some((text) => /inline event handler|script-src/i.test(text))).toBe(true);
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
