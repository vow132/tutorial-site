import { expect, test, type Browser, type BrowserContext, type CDPSession } from "@playwright/test";
import { admin, collectErrors } from "./helpers";

/** WebAuthn 不接受 IP 作为站点 ID，这组测试用 localhost 访问（服务端 SITE_URL 也是 localhost）。 */
const LOCAL = `http://localhost:${process.env.E2E_PORT ?? 3100}`;

type Credential = Record<string, unknown>;

/** 用 Chrome DevTools 协议挂一个「内置指纹」的虚拟认证器，可选预置已有的通行密钥。 */
async function withAuthenticator(browser: Browser, credential?: Credential) {
  const context: BrowserContext = await browser.newContext({ baseURL: LOCAL });
  const page = await context.newPage();
  const cdp: CDPSession = await context.newCDPSession(page);
  await cdp.send("WebAuthn.enable");
  const { authenticatorId } = await cdp.send("WebAuthn.addVirtualAuthenticator", {
    options: {
      protocol: "ctap2",
      transport: "internal",
      hasResidentKey: true,
      hasUserVerification: true,
      isUserVerified: true,
      automaticPresenceSimulation: true,
    },
  });
  if (credential) {
    await cdp.send("WebAuthn.addCredential", { authenticatorId, credential: credential as never });
  }
  return { context, page, cdp, authenticatorId };
}

test("passkeys: register with password re-auth, sign in without a password, then remove", async ({ browser }) => {
  // 1. 密码登录，在「账号安全」登记通行密钥
  const first = await withAuthenticator(browser);
  const errors = collectErrors(first.page);
  await first.page.goto("/admin/login");
  await first.page.fill('input[name="username"]', admin.username);
  await first.page.fill('input[name="password"]', admin.password);
  await first.page.getByRole("button", { name: /^登\s*录$/ }).click();
  await expect(first.page).toHaveURL(/\/admin(\/account\?weak=1)?$/);

  await first.page.goto("/admin/account#passkeys");
  await first.page.fill("#passkey-name", "E2E 虚拟密钥");
  await first.page.fill("#passkey-password", "not-the-password");
  await first.page.getByRole("button", { name: "添加通行密钥" }).click();
  await expect(first.page.getByText("当前密码不正确")).toBeVisible();

  await first.page.fill("#passkey-password", admin.password);
  await first.page.getByRole("button", { name: "添加通行密钥" }).click();
  await expect(first.page.getByText("已添加「E2E 虚拟密钥」")).toBeVisible();
  await expect(first.page.getByText("还没用过")).toBeVisible();
  const { credentials } = await first.cdp.send("WebAuthn.getCredentials", { authenticatorId: first.authenticatorId });
  expect(credentials).toHaveLength(1);
  expect(credentials[0].isResidentCredential).toBe(true);

  // 2. 另一个浏览器（没有任何 Cookie）只用通行密钥登录，不输入用户名和密码
  const second = await withAuthenticator(browser, credentials[0] as unknown as Credential);
  await second.page.goto("/admin/login");
  await second.page.getByRole("button", { name: "使用通行密钥登录" }).click();
  await expect(second.page).toHaveURL(/\/admin$/);
  await expect(second.page.getByRole("heading", { name: "仪表盘" })).toBeVisible();

  // 3. 第一个浏览器里能看到使用记录，然后删除；删除后登录页不再提供通行密钥登录
  await first.page.goto("/admin/account");
  await expect(first.page.getByText(/上次使用/)).toBeVisible();
  first.page.once("dialog", (dialog) => dialog.accept());
  await first.page.getByRole("listitem").filter({ hasText: "E2E 虚拟密钥" }).getByRole("button", { name: "删除" }).click();
  await expect(first.page.getByText("已删除「E2E 虚拟密钥」")).toBeVisible();

  const third = await withAuthenticator(browser, credentials[0] as unknown as Credential);
  await third.page.goto("/admin/login");
  await expect(third.page.getByRole("button", { name: "使用通行密钥登录" })).toHaveCount(0);

  expect(errors).toEqual([]);
  await Promise.all([first.context.close(), second.context.close(), third.context.close()]);
});
