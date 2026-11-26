import { expect, test, type Page } from "@playwright/test";
import { ADMIN_STATE, createTutorialViaForm, deleteTutorialRow, uniqueSuffix } from "./helpers";

test.use({ storageState: ADMIN_STATE });

const SERVER = "https://waline.example.test";

/** 在后台「站点设置 → 评论」里选服务并保存 */
async function setComments(page: Page, provider: string, server = "") {
  await page.goto("/admin/settings");
  await page.locator('select[name="comments.provider"]').selectOption(provider);
  if (server) await page.locator('input[name="comments.server"]').fill(server);
  await page.getByRole("button", { name: "保存设置" }).click();
  await expect(page.getByText("设置已保存，前台已生效")).toBeVisible();
}

/*
 * 第三方评论：文章页文末的 iframe 加载 /comments/frame，评论页按所选服务下发只放行它的 CSP。
 * 测试不连外网：把 CDN 上的 Waline 脚本换成一个假的，只验证本站这一侧（加载时机、参数、CSP、高度、主题）。
 */
test("third-party comments load in a frame with their own CSP, sized to the content and following the theme", async ({ page }) => {
  const id = uniqueSuffix();
  const title = `e2e-评论-${id}`;
  const slug = `e2e-comments-${id}`;
  await page.route("https://registry.npmmirror.com/**", (route) => {
    const url = route.request().url();
    if (url.endsWith(".css")) return route.fulfill({ contentType: "text/css", body: "" });
    return route.fulfill({
      contentType: "application/javascript",
      body: `window.Waline = { init: function (options) {
        var box = document.querySelector(options.el);
        box.innerHTML = '<p id="fake">假的评论组件：' + options.path + ' @ ' + options.serverURL + '</p><div style="height:900px"></div>';
        return {};
      } };`,
    });
  });

  try {
    await createTutorialViaForm(page, { title, slug });

    // 没开评论：文末没有评论区
    await page.goto(`/tutorials/${slug}`);
    await expect(page.locator("#comments")).toHaveCount(0);
    expect((await page.request.get(`/comments/frame?slug=${slug}`)).status()).toBe(404);

    // 服务端地址必须是 https
    await page.goto("/admin/settings");
    await page.locator('select[name="comments.provider"]').selectOption("waline");
    await page.locator('input[name="comments.server"]').fill("http://insecure.example.test");
    await page.getByRole("button", { name: "保存设置" }).click();
    await expect(page.getByText(/要用 https/)).toBeVisible();
    await setComments(page, "waline", SERVER);

    // 评论页自己的 CSP：脚本只放行 nonce 和 CDN，只能被本站嵌入；文章页的 CSP 不变
    const frameResponse = await page.request.get(`/comments/frame?slug=${slug}`);
    expect(frameResponse.status()).toBe(200);
    const frameCsp = frameResponse.headers()["content-security-policy"];
    expect(frameCsp).toMatch(/script-src 'nonce-[^']+' https:\/\/registry\.npmmirror\.com(;|$)/);
    expect(frameCsp).toContain("frame-ancestors 'self'");
    expect(frameResponse.headers()["x-frame-options"]).toBe("SAMEORIGIN");
    expect((await page.request.get(`/comments/frame?slug=e2e-missing-${id}`)).status()).toBe(404);
    const articleCsp = (await page.request.get(`/tutorials/${slug}`)).headers()["content-security-policy"];
    expect(articleCsp).not.toContain("npmmirror");

    await page.emulateMedia({ colorScheme: "light" });
    await page.goto(`/tutorials/${slug}`);
    const section = page.locator("#comments");
    await expect(section.getByRole("heading", { name: "评论" })).toBeVisible();
    await section.scrollIntoViewIfNeeded();
    const frame = page.frameLocator("#comments iframe");
    await expect(frame.locator("#fake")).toHaveText(`假的评论组件：/tutorials/${slug} @ ${SERVER}`);
    // 高度跟着内容走（假组件里有 900px 的内容）
    await expect.poll(async () => parseInt(await page.locator("#comments iframe").evaluate((el) => (el as HTMLElement).style.height))).toBeGreaterThan(900);
    // 切换主题，评论页跟着换
    await expect(frame.locator("html")).toHaveAttribute("data-theme", "light");
    await page.locator("[data-theme-toggle]:visible").first().click();
    await expect(frame.locator("html")).toHaveAttribute("data-theme", "dark");

    // 直接打开评论页（比如 Giscus 登录后跳回来）：回到文章的评论区
    await page.goto(`/comments/frame?slug=${slug}`);
    await expect(page).toHaveURL(new RegExp(`/tutorials/${slug}#comments$`));
  } finally {
    await setComments(page, "none");
    await deleteTutorialRow(page, title);
  }
});
