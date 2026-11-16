import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { expect, test } from "@playwright/test";
import { ADMIN_STATE, admin, collectErrors } from "./helpers";

type Received = { event: string; title: string; lines: string[] };

/** 本地 Webhook 接收端：网站把告警 POST 到这里，测试检查收到的内容。 */
let server: Server;
let hookUrl = "";
const received: Received[] = [];

test.beforeAll(async () => {
  server = createServer((request, response) => {
    let body = "";
    request.on("data", (chunk) => (body += chunk));
    request.on("end", () => {
      try {
        received.push(JSON.parse(body));
      } catch {
        // ignore malformed bodies
      }
      response.writeHead(204).end();
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  hookUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}/hook`;
});

test.afterAll(async () => {
  await new Promise((resolve) => server.close(resolve));
});

const titles = () => received.map((item) => item.title);

test.describe.serial("security alerts", () => {
  test.use({ storageState: ADMIN_STATE });

  test("alert settings require the current password, then deliver a test message", async ({ page }) => {
    const errors = collectErrors(page);
    await page.goto("/admin/account#alerts");
    await page.selectOption("#alert-channel", "webhook");
    await page.fill("#alert-url", hookUrl);

    await page.getByRole("button", { name: "保存告警设置" }).click();
    await expect(page.getByText("当前密码不正确")).toBeVisible();
    // 出错后已填内容保留
    await expect(page.locator("#alert-url")).toHaveValue(hookUrl);

    await page.fill("#alert-password", admin.password);
    await page.getByRole("button", { name: "保存告警设置" }).click();
    await expect(page.getByText("已保存")).toBeVisible();

    await page.getByRole("button", { name: "发送测试消息" }).click();
    await expect(page.getByText("测试消息已发出")).toBeVisible();
    await expect.poll(titles).toContain("测试消息：安全告警推送正常");
    const testMessage = received.find((item) => item.event === "alerts.test")!;
    expect(testMessage.lines.join("\n")).toContain(`操作人：${admin.username}`);
    expect(errors).toEqual([]);
  });

  test("dashboard shows backup and alert status", async ({ page }) => {
    await page.goto("/admin");
    await expect(page.getByText("上次数据库备份")).toBeVisible();
    await expect(page.getByText("已开启 · 通用 Webhook（JSON）")).toBeVisible();
  });

  test("a login from a new device is pushed", async ({ browser }) => {
    const context = await browser.newContext({ storageState: { cookies: [], origins: [] } });
    const page = await context.newPage();
    await page.goto("/admin/login");
    await page.fill('input[name="username"]', admin.username);
    await page.fill('input[name="password"]', admin.password);
    await page.getByRole("button", { name: /登\s*录/ }).click();
    await expect(page).toHaveURL(/\/admin(\/account\?weak=1)?$/);
    await expect.poll(titles).toContain("新设备登录了后台");
    const alert = received.find((item) => item.event === "login.success")!;
    expect(alert.lines.join("\n")).toContain(`账号：${admin.username}`);
    await context.close();
  });

  test("repeated wrong passwords lock the login and are pushed", async ({ browser }) => {
    const context = await browser.newContext({ storageState: { cookies: [], origins: [] } });
    const page = await context.newPage();
    const username = `e2e-lock-${Date.now()}`;
    await page.goto("/admin/login");
    for (let i = 0; i < 10; i++) {
      await page.fill('input[name="username"]', username);
      await page.fill('input[name="password"]', `wrong-password-${i}`);
      await page.getByRole("button", { name: /登\s*录/ }).click();
      await expect(page.getByText(/用户名或密码错误|尝试次数过多/)).toBeVisible();
    }
    await expect.poll(titles).toContain("后台登录因多次失败已被临时锁定");
    const alert = received.find((item) => item.event === "login.locked")!;
    expect(alert.lines.join("\n")).toContain(username);
    await context.close();
  });

  test("turning alerts off notifies the old channel first", async ({ page }) => {
    const before = received.length;
    await page.goto("/admin/account#alerts");
    await page.selectOption("#alert-channel", "off");
    await page.fill("#alert-password", admin.password);
    await page.getByRole("button", { name: "保存告警设置" }).click();
    await expect(page.getByText("已关闭安全告警")).toBeVisible();
    await expect.poll(() => received.slice(before).map((item) => item.title)).toContain("告警推送设置被修改");
  });
});
