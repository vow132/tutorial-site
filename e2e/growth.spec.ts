import { rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { expect, test, type Page } from "@playwright/test";
import sharp from "sharp";
import { ADMIN_STATE, collectErrors, createTutorialViaForm, deleteTutorialRow, uniqueSuffix } from "./helpers";
import { startSmtpServer } from "./smtp-server";

test.use({ storageState: ADMIN_STATE });

async function saveMailSettings(page: Page, values: { enabled: boolean; host: string; port: string; fromEmail: string }) {
  await page.goto("/admin/subscribers");
  const enabled = page.getByLabel(/开启邮件订阅/);
  if (values.enabled) await enabled.check();
  else await enabled.uncheck();
  await page.getByLabel("SMTP 服务器").fill(values.host);
  await page.getByLabel("端口", { exact: true }).fill(values.port);
  await page.getByLabel(/使用 SSL\/TLS/).uncheck();
  await page.getByLabel("发件人邮箱").fill(values.fromEmail);
  await page.getByRole("button", { name: "保存发信设置" }).click();
  await expect(page.getByText(/^已保存/)).toBeVisible();
}

test("readers subscribe by email, get each new tutorial once, and can unsubscribe", async ({ page, browser }) => {
  const smtp = await startSmtpServer();
  const id = uniqueSuffix();
  const email = `reader-${id}@example.com`;
  const title = `E2E 订阅 ${id}`;
  const slug = `e2e-subscribe-${id}`;
  const mailsTo = (address: string) => smtp.mails.filter((mail) => mail.to.includes(address));
  try {
    await saveMailSettings(page, { enabled: true, host: "127.0.0.1", port: String(smtp.port), fromEmail: "noreply@example.com" });
    await page.getByLabel("测试收件邮箱").fill("admin@example.com");
    await page.getByRole("button", { name: "发送测试邮件" }).click();
    await expect(page.getByText("已发送到 admin@example.com，请查收（也看看垃圾邮件）")).toBeVisible();
    expect(mailsTo("admin@example.com")).toHaveLength(1);

    // 读者在文章页订阅，收到确认邮件，点确认
    const reader = await browser.newContext();
    const visitor = await reader.newPage();
    const errors = collectErrors(visitor);
    await visitor.goto("/tutorials/css-flexbox-guide");
    const box = visitor.locator("section.subscribe-box");
    await box.getByLabel("邮箱地址").fill(email);
    await box.getByRole("button", { name: "订阅" }).click();
    await expect(box.getByRole("status")).toContainText(email);
    await expect.poll(() => mailsTo(email).length).toBe(1);
    expect(mailsTo(email)[0].subject).toContain("确认订阅");
    const confirmUrl = /https?:\/\/\S+\/subscribe\/confirm\?token=[\w.-]+/.exec(mailsTo(email)[0].text)?.[0];
    expect(confirmUrl).toBeTruthy();
    // 打开链接还不算确认（防止邮箱安全扫描自动点开），要点按钮
    await visitor.goto(confirmUrl!);
    await visitor.getByRole("button", { name: "确认订阅" }).click();
    await expect(visitor.getByRole("heading", { name: "订阅成功" })).toBeVisible();
    expect(errors).toEqual([]);
    await reader.close();

    await page.goto("/admin/subscribers");
    await expect(page.getByRole("row").filter({ hasText: email })).toContainText("已确认");

    // 发布新教程：订阅者收到一封通知，带一键退订
    await createTutorialViaForm(page, { title, slug });
    await expect.poll(() => mailsTo(email).filter((mail) => mail.subject === `新教程：${title}`).length, { timeout: 15_000 }).toBe(1);
    const notice = mailsTo(email).find((mail) => mail.subject === `新教程：${title}`)!;
    expect(notice.headers).toContain("List-Unsubscribe-Post: List-Unsubscribe=One-Click");
    expect(notice.text).toContain(`/tutorials/${slug}`);

    // 撤回再发布不会重发
    await page.goto(`/admin/tutorials?q=${id}`);
    await page.getByRole("row").filter({ hasText: title }).getByRole("button", { name: "已发布" }).click();
    await page.getByRole("row").filter({ hasText: title }).getByRole("button", { name: "草稿" }).click();
    await expect(page.getByRole("row").filter({ hasText: title }).getByRole("button", { name: "已发布" })).toBeVisible();
    await page.waitForTimeout(1500);
    expect(mailsTo(email).filter((mail) => mail.subject === `新教程：${title}`)).toHaveLength(1);

    // 退订：打开邮件里的链接，点确认
    const unsubscribeUrl = /https?:\/\/\S+\/subscribe\/unsubscribe\?token=[\w.-]+/.exec(notice.text)?.[0];
    const other = await browser.newContext();
    const otherPage = await other.newPage();
    await otherPage.goto(unsubscribeUrl!);
    await otherPage.getByRole("button", { name: "确认退订" }).click();
    await expect(otherPage.getByRole("heading", { name: "已退订" })).toBeVisible();
    await other.close();
    await page.goto("/admin/subscribers");
    await expect(page.getByRole("row").filter({ hasText: email })).toHaveCount(0);
  } finally {
    await saveMailSettings(page, { enabled: false, host: "", port: "465", fromEmail: "" });
    await deleteTutorialRow(page, title);
    await smtp.close();
  }
  // 关掉之后读者看不到订阅框
  await page.goto("/tutorials/css-flexbox-guide");
  await expect(page.locator("section.subscribe-box")).toHaveCount(0);
});

test("subscription endpoints reject abuse and bad links", async ({ request }) => {
  const crossSite = await request.post("/api/subscribe", { headers: { "sec-fetch-site": "cross-site" }, data: { email: "a@example.com" } });
  expect(crossSite.status()).toBe(403);
  expect((await request.post("/api/subscribe", { data: { email: "not-an-email" } })).status()).toBe(400);
  // 没开启时不接受订阅
  expect((await request.post("/api/subscribe", { data: { email: "someone@example.com" } })).status()).toBe(404);
  const oneClick = await request.post("/api/unsubscribe?token=1.forged-token-forged-token-forg", { form: { "List-Unsubscribe": "One-Click" } });
  expect(oneClick.status()).toBe(400);
});

test("sponsor, donation QR, start-here and article motion come from site settings", async ({ page }) => {
  const errors = collectErrors(page);
  const id = uniqueSuffix();
  const seriesTitle = `E2E 入门路线 ${id}`;
  const seriesSlug = `e2e-start-${id}`;
  const title = `E2E 第一篇 ${id}`;
  const slug = `e2e-start-first-${id}`;
  const qr = path.join(os.tmpdir(), `qr-${id}.png`);
  await sharp({ create: { width: 300, height: 300, channels: 3, background: "#ffffff" } }).png().toFile(qr);
  const settingsInput = (name: string) => page.locator(`input[name="${name}"]`);

  try {
    await page.goto("/admin/series");
    await page.getByLabel(/^系列名称/).fill(seriesTitle);
    await page.getByLabel("网址别名").fill(seriesSlug);
    await page.getByRole("button", { name: "创建系列" }).click();
    await expect(page).toHaveURL(/\/admin\/series\/\d+$/);
    await createTutorialViaForm(page, { title, slug, series: seriesTitle });

    await page.goto("/admin/settings");
    await settingsInput("support.donationText").fill("请作者喝杯咖啡");
    await page.getByLabel("上传微信收款码").setInputFiles(qr);
    await expect(page.getByAltText("微信收款码预览")).toBeVisible();
    await settingsInput("support.sponsorText").fill("本站由 E2E 云赞助");
    await settingsInput("support.sponsorUrl").fill("https://sponsor.example");
    await settingsInput("startHere.title").fill("新手从这里开始");
    await page.locator(`input[name="startHere.series"][value="${seriesSlug}"]`).check();
    await page.locator('input[name="articleMotion"][value="full"]').check();
    await page.getByRole("button", { name: "保存设置" }).click();
    await expect(page.getByText("设置已保存，前台已生效")).toBeVisible();

    await page.goto(`/tutorials/${slug}`);
    const support = page.getByRole("complementary", { name: "支持本站" });
    await support.getByText("请作者喝杯咖啡").click();
    await expect(support.getByAltText("微信收款码")).toBeVisible();
    await expect(support.getByRole("link", { name: /E2E 云赞助/ })).toHaveAttribute("rel", /sponsored/);
    await expect(page.locator("[data-motion]")).toHaveAttribute("data-motion", "full");

    await page.goto("/");
    const startHere = page.getByRole("region", { name: "新手从这里开始" });
    await expect(startHere.getByRole("link", { name: seriesTitle })).toHaveAttribute("href", `/series/${seriesSlug}`);
    await expect(startHere.getByRole("link", { name: new RegExp(`从第 1 篇开始：${title}`) })).toHaveAttribute("href", `/tutorials/${slug}`);
    expect(errors).toEqual([]);
  } finally {
    // 恢复默认：清空赞助与打赏、取消勾选系列、动效回到精简
    await page.goto("/admin/settings");
    await settingsInput("support.donationText").fill("");
    const remove = page.getByRole("button", { name: "移除" });
    while (await remove.count()) await remove.first().click();
    await settingsInput("support.sponsorText").fill("");
    await settingsInput("support.sponsorUrl").fill("");
    await settingsInput("startHere.title").fill("从这里开始");
    const box = page.locator(`input[name="startHere.series"][value="${seriesSlug}"]`);
    if (await box.count()) await box.uncheck();
    await page.locator('input[name="articleMotion"][value="calm"]').check();
    await page.getByRole("button", { name: "保存设置" }).click();
    await expect(page.getByText("设置已保存，前台已生效")).toBeVisible();
    await deleteTutorialRow(page, title);
    await page.goto("/admin/series");
    const link = page.getByRole("link", { name: seriesTitle, exact: true });
    if (await link.count()) {
      await link.click();
      page.once("dialog", (dialog) => dialog.accept());
      await page.getByRole("button", { name: "删除系列" }).click();
      await page.waitForURL(/\/admin\/series$/);
    }
    await rm(qr, { force: true });
  }
  await page.goto("/tutorials/css-flexbox-guide");
  await expect(page.locator("[data-motion]")).toHaveAttribute("data-motion", "calm");
  await expect(page.getByRole("complementary", { name: "支持本站" })).toHaveCount(0);
});
