import { createServer, type Server } from "node:http";
import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import { ADMIN_STATE, admin, collectErrors, createTutorialViaForm, deleteTutorialRow, queryDatabase, uniqueSuffix, writeDatabase } from "./helpers";
import { startSmtpServer } from "./smtp-server";

test.use({ storageState: ADMIN_STATE });

/** 普通浏览器的 UA：Playwright 自带的 HeadlessChrome 会被当作爬虫，读者留言直接丢弃。 */
const DESKTOP_UA =
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36";

/** 和 playwright.config.ts 里 TURNSTILE_VERIFY_URL 的端口一致 */
const VERIFY_PORT = Number(process.env.E2E_TURNSTILE_PORT ?? 3190);
const SITE_KEY = "e2e0SiteKey00000001";
const GOOD_SECRET = "e2e0GoodSecret00001";
const WRONG_SECRET = "e2e0WrongSecret0001";

/**
 * 假的 Cloudflare：测试不连外网。
 * - 浏览器端：拦下 challenges.cloudflare.com 的脚本，换成一个假的 window.turnstile，渲染后马上给出令牌
 *   「<前缀>:<action>」（前缀 pass 会通过，fail 会被拒）；
 * - 服务端：TURNSTILE_VERIFY_URL 指向这里的假 siteverify，按令牌和 Secret Key 回答，并记下收到的请求。
 */
function fakeTurnstileScript(prefix: "pass" | "fail") {
  return `(() => {
    let n = 0;
    const widgets = {};
    // 和真的 Turnstile 一样，令牌稍后才给出；给出后在小组件上标记 data-issued，测试据此等令牌到手再提交
    const issue = (id) => setTimeout(() => {
      const widget = widgets[id];
      if (!widget) return;
      widget.opts.callback("${prefix}:" + widget.opts.action + ":" + (++n));
      widget.box.dataset.issued = "1";
    }, 30);
    window.turnstile = {
      render(el, opts) {
        const id = "w" + (++n);
        const box = document.createElement("div");
        box.className = "fake-turnstile";
        box.textContent = "假的人机验证（" + opts.action + "）";
        el.appendChild(box);
        widgets[id] = { box, opts };
        issue(id);
        return id;
      },
      reset(id) { issue(id); },
      remove(id) { if (widgets[id]) { widgets[id].box.remove(); delete widgets[id]; } },
    };
  })();`;
}

async function useFakeTurnstile(target: Page | BrowserContext, prefix: "pass" | "fail" = "pass") {
  const loads: string[] = [];
  await target.route("https://challenges.cloudflare.com/**", (route) => {
    loads.push(route.request().url());
    return route.fulfill({ contentType: "application/javascript", body: fakeTurnstileScript(prefix) });
  });
  return loads;
}

type Verification = { secret: string; response: string; remoteip: string | null; idempotencyKey: string | null };

async function startFakeSiteverify() {
  const received: Verification[] = [];
  const server: Server = createServer((request, response) => {
    let body = "";
    request.on("data", (chunk) => (body += chunk));
    request.on("end", () => {
      const form = new URLSearchParams(body);
      const token = form.get("response") ?? "";
      const secret = form.get("secret") ?? "";
      received.push({ secret, response: token, remoteip: form.get("remoteip"), idempotencyKey: form.get("idempotency_key") });
      const [prefix, action] = token.split(":");
      const result =
        secret !== GOOD_SECRET
          ? { success: false, "error-codes": ["invalid-input-secret"] }
          : prefix === "pass"
            ? { success: true, action, hostname: "localhost", challenge_ts: new Date().toISOString() }
            : { success: false, "error-codes": ["invalid-input-response"] };
      response.writeHead(200, { "Content-Type": "application/json" });
      response.end(JSON.stringify(result));
    });
  });
  await new Promise<void>((resolve) => server.listen(VERIFY_PORT, "127.0.0.1", resolve));
  return { received, close: () => new Promise<void>((resolve) => server.close(() => resolve())) };
}

/** 后台「站点设置 → 人机验证」 */
async function turnstileSection(page: Page) {
  await page.goto("/admin/settings");
  return page.locator("section").filter({ has: page.getByRole("heading", { name: /人机验证/ }) });
}

async function turnOff(page: Page) {
  const section = await turnstileSection(page);
  await section.getByLabel("开启人机验证").uncheck();
  await section.getByRole("button", { name: "保存人机验证设置" }).click();
  await expect(section.getByText("已保存（人机验证未开启）")).toBeVisible();
}

async function saveMailSettings(page: Page, values: { enabled: boolean; port?: number }) {
  await page.goto("/admin/subscribers");
  const enabled = page.getByLabel(/开启邮件订阅/);
  if (values.enabled) await enabled.check();
  else await enabled.uncheck();
  await page.getByLabel("SMTP 服务器").fill("127.0.0.1");
  await page.getByLabel("端口", { exact: true }).fill(String(values.port ?? 25));
  await page.getByLabel(/使用 SSL\/TLS/).uncheck();
  await page.getByLabel("发件人邮箱").fill("noreply@example.com");
  await page.getByRole("button", { name: "保存发信设置" }).click();
  await expect(page.getByText(/^已保存/)).toBeVisible();
}

/*
 * 人机验证：开启前要先用这组密钥过一次验证；开启后后台密码登录、邮件订阅、读者留言都要令牌，
 * 前台只在读者用到表单时才加载 Cloudflare 的脚本；关闭后恢复原样。
 */
test("Cloudflare Turnstile guards login, subscriptions and reader notes, and can only be turned on with working keys", async ({ page, browser }) => {
  test.setTimeout(120_000);
  const siteverify = await startFakeSiteverify();
  const smtp = await startSmtpServer();
  await useFakeTurnstile(page);
  const id = uniqueSuffix();
  const title = `e2e-人机验证-${id}`;
  const slug = `e2e-turnstile-${id}`;
  const contexts: BrowserContext[] = [];
  const newContext = async (options: Parameters<typeof browser.newContext>[0] = {}) => {
    // 没登录的访客（不继承 test.use 里管理员的登录状态）
    const context = await browser.newContext({ userAgent: DESKTOP_UA, storageState: { cookies: [], origins: [] }, ...options });
    contexts.push(context);
    return context;
  };

  try {
    // 前台和后台的 CSP 都放行 Cloudflare 的脚本和 iframe
    for (const path of ["/", "/admin/login"]) {
      const csp = (await page.request.get(path)).headers()["content-security-policy"] ?? "";
      expect(csp).toMatch(/script-src [^;]*https:\/\/challenges\.cloudflare\.com/);
      expect(csp).toMatch(/frame-src 'self' https:\/\/challenges\.cloudflare\.com/);
    }

    // 不先过验证不能开启
    let section = await turnstileSection(page);
    await section.getByLabel("开启人机验证").check();
    await section.getByLabel("Site Key").fill("bad key!");
    await section.getByRole("button", { name: "保存人机验证设置" }).click();
    await expect(section.getByText(/Site Key 格式不对/)).toBeVisible();

    // Secret Key 不对：试验通过了，但服务器核对失败，不保存
    await section.getByLabel("Site Key").fill(SITE_KEY);
    await section.getByLabel("Secret Key").fill(WRONG_SECRET);
    await expect(section.getByText("假的人机验证（settings）")).toBeVisible();
    await expect(section.locator('input[name="turnstileToken"]')).toHaveCount(1);
    await section.getByRole("button", { name: "保存人机验证设置" }).click();
    await expect(section.getByText(/验证没通过，没有保存：invalid-input-secret/)).toBeVisible();
    expect(queryDatabase<{ value: string }>(`SELECT value FROM "Setting" WHERE key = 'turnstile'`)?.value ?? "").not.toContain('"enabled":true');

    // 对的 Secret Key：重新验证后保存成功；Secret Key 加密存库
    await section.getByLabel("Secret Key").fill(GOOD_SECRET);
    await page.waitForTimeout(300);
    await expect(section.locator('input[name="turnstileToken"]')).toHaveCount(1);
    await section.getByRole("button", { name: "保存人机验证设置" }).click();
    await expect(section.getByText(/^已开启/)).toBeVisible();
    const stored = queryDatabase<{ value: string }>(`SELECT value FROM "Setting" WHERE key = 'turnstile'`)!.value;
    expect(stored).toContain('"enabled":true');
    expect(stored).not.toContain(GOOD_SECRET);
    expect(siteverify.received.at(-1)).toMatchObject({ secret: GOOD_SECRET, response: expect.stringMatching(/^pass:settings:/) });
    expect(siteverify.received.at(-1)?.idempotencyKey).toMatch(/^[0-9a-f-]{36}$/);
    // 页面不回显 Secret Key
    section = await turnstileSection(page);
    await expect(section.getByLabel("Secret Key")).toHaveValue("");
    await expect(section.getByLabel("Secret Key")).toHaveAttribute("placeholder", "已设置，留空则不修改");

    // 后台登录：令牌被拒时不登录（也不算一次密码错误），通过时正常登录
    const blocked = await newContext();
    await useFakeTurnstile(blocked, "fail");
    const blockedPage = await blocked.newPage();
    await blockedPage.goto("/admin/login");
    await expect(blockedPage.getByText("假的人机验证（login）")).toBeVisible();
    await blockedPage.getByLabel("用户名").fill(admin.username);
    await blockedPage.getByLabel("密码").fill(admin.password);
    await expect(blockedPage.locator(".fake-turnstile[data-issued]")).toBeAttached();
    await blockedPage.getByRole("button", { name: "登 录" }).click();
    await expect(blockedPage.getByText("人机验证没通过，请重新验证后再提交")).toBeVisible();
    await expect(blockedPage).toHaveURL(/\/admin\/login/);
    // 不带令牌直接调登录也不行：开启后没有令牌的提交一律拒绝
    const noScript = await newContext();
    await noScript.route("https://challenges.cloudflare.com/**", (route) => route.abort());
    const noScriptPage = await noScript.newPage();
    await noScriptPage.goto("/admin/login");
    await expect(noScriptPage.getByText(/人机验证加载失败/)).toBeVisible();
    await noScriptPage.getByLabel("用户名").fill(admin.username);
    await noScriptPage.getByLabel("密码").fill(admin.password);
    // 小组件加载失败时按钮可以点（交给服务器判断），服务器拒绝
    await noScriptPage.getByRole("button", { name: "登 录" }).click();
    await expect(noScriptPage.getByText("人机验证没通过，请重新验证后再提交")).toBeVisible();

    const allowed = await newContext();
    await useFakeTurnstile(allowed);
    const allowedPage = await allowed.newPage();
    const loginErrors = collectErrors(allowedPage);
    await allowedPage.goto("/admin/login");
    await allowedPage.getByLabel("用户名").fill(admin.username);
    await allowedPage.getByLabel("密码").fill(admin.password);
    await expect(allowedPage.locator(".fake-turnstile[data-issued]")).toBeAttached();
    await allowedPage.getByRole("button", { name: "登 录" }).click();
    await allowedPage.waitForURL((url) => !url.pathname.startsWith("/admin/login"));
    expect(siteverify.received.at(-1)?.response).toMatch(/^pass:login:/);
    expect(loginErrors).toEqual([]);

    // 读者留言：投票不用验证；留言框出现时才加载 Cloudflare 的脚本
    await createTutorialViaForm(page, { title, slug });
    const tutorialId = queryDatabase<{ id: number }>(`SELECT id FROM "Tutorial" WHERE slug = ?`, slug)!.id;
    const readerContext = await newContext();
    const scriptLoads = await useFakeTurnstile(readerContext);
    const reader = await readerContext.newPage();
    const readerErrors = collectErrors(reader);
    await reader.goto(`/tutorials/${slug}`);
    const feedback = reader.locator("section.helpful-feedback");
    await feedback.getByRole("button", { name: "没帮助" }).click();
    await expect(feedback.getByText("假的人机验证（feedback）")).toBeVisible();
    expect(scriptLoads).toHaveLength(1);
    const note = `人机验证后的留言 ${id}`;
    await feedback.getByLabel(/哪里没讲清楚/).fill(note);
    await expect(feedback.locator(".fake-turnstile[data-issued]")).toBeAttached();
    await feedback.getByRole("button", { name: "发送" }).click();
    await expect(feedback.getByRole("status")).toHaveText("收到了，谢谢你花时间写下来！");
    expect(queryDatabase(`SELECT id FROM "FeedbackMessage" WHERE message = ?`, note)).toBeTruthy();
    // 不带令牌、或令牌是给别的表单的：拒绝
    const withoutToken = await reader.request.post("/api/feedback/message", { data: { id: tutorialId, message: `没有令牌 ${id}` } });
    expect(withoutToken.status()).toBe(400);
    const wrongAction = await reader.request.post("/api/feedback/message", { data: { id: tutorialId, message: `别的表单的令牌 ${id}`, turnstileToken: "pass:login:1" } });
    expect(wrongAction.status()).toBe(400);
    expect(queryDatabase(`SELECT id FROM "FeedbackMessage" WHERE message LIKE ?`, `%令牌 ${id}`)).toBeUndefined();

    // 邮件订阅：点进邮箱框才加载小组件，验证通过才发确认邮件
    await saveMailSettings(page, { enabled: true, port: smtp.port });
    await reader.goto(`/tutorials/${slug}`);
    const box = reader.locator("section.subscribe-box");
    await expect(box.getByLabel("邮箱地址")).toBeVisible();
    expect(scriptLoads).toHaveLength(1); // 这次打开页面还没加载
    const email = `turnstile-${id}@example.com`;
    await box.getByLabel("邮箱地址").fill(email);
    await expect(box.getByText("假的人机验证（subscribe）")).toBeVisible();
    // 令牌到手前点订阅，表单会提示「正在验证」而不提交（components/subscribe-form.tsx），所以先等令牌
    await expect(box.locator(".fake-turnstile[data-issued]")).toBeAttached();
    await box.getByRole("button", { name: "订阅" }).click();
    await expect(box.getByRole("status")).toContainText(email);
    await expect.poll(() => smtp.mails.filter((mail) => mail.to.includes(email)).length).toBe(1);
    const subscribeWithout = await reader.request.post("/api/subscribe", { data: { email: `no-token-${id}@example.com` } });
    expect(subscribeWithout.status()).toBe(400);
    expect(readerErrors).toEqual([]);

    // 关闭后：登录页没有小组件，不带令牌的留言照常收下
    await turnOff(page);
    const after = await newContext();
    const afterLoads = await useFakeTurnstile(after);
    const afterPage = await after.newPage();
    await afterPage.goto("/admin/login");
    await expect(afterPage.getByRole("button", { name: "登 录" })).toBeEnabled();
    expect(afterLoads).toHaveLength(0);
    const plain = await afterPage.request.post("/api/feedback/message", { data: { id: tutorialId, message: `关闭后的留言 ${id}` } });
    expect(plain.status()).toBe(204);
  } finally {
    for (const context of contexts) await context.close().catch(() => {});
    await turnOff(page).catch(() => writeDatabase(`DELETE FROM "Setting" WHERE key = 'turnstile'`));
    await saveMailSettings(page, { enabled: false }).catch(() => {});
    writeDatabase(`DELETE FROM "Subscriber" WHERE email LIKE ?`, `%-${id}@example.com`);
    writeDatabase(`DELETE FROM "FeedbackMessage" WHERE message LIKE ?`, `%${id}`);
    await deleteTutorialRow(page, title);
    await smtp.close();
    await siteverify.close();
  }
});

/*
 * 防爬：robots.txt 拒绝 AI 训练爬虫（搜索引擎不受影响）；复制一大段正文时附上来源，复制代码和几个字不附。
 */
test("anti-scraping settings: AI crawlers in robots.txt and a source line on copied text", async ({ page }) => {
  const id = uniqueSuffix();
  const title = `e2e-防爬-${id}`;
  const slug = `e2e-anti-scrape-${id}`;
  const paragraph = "这是一段足够长的正文，用来测试复制时会不会自动附上来源链接。".repeat(3);

  const setToggles = async (on: boolean) => {
    await page.goto("/admin/settings");
    for (const name of ["antiScrape.blockAiCrawlers", "antiScrape.copyAttribution"]) {
      const box = page.locator(`input[name="${name}"]`);
      if (on) await box.check();
      else await box.uncheck();
    }
    await page.getByRole("button", { name: "保存设置" }).click();
    await expect(page.getByText("设置已保存，前台已生效")).toBeVisible();
  };

  /** 选中 selector 的内容（或其中前 length 个字），派发 copy 事件，返回剪贴板里的内容 */
  const copy = (selector: string, length?: number) =>
    page.evaluate(
      ({ selector, length }) => {
        const element = document.querySelector(selector)!;
        const range = document.createRange();
        if (length) {
          const text = element.firstChild!;
          range.setStart(text, 0);
          range.setEnd(text, length);
        } else {
          range.selectNodeContents(element);
        }
        const selection = window.getSelection()!;
        selection.removeAllRanges();
        selection.addRange(range);
        const event = new ClipboardEvent("copy", { clipboardData: new DataTransfer(), bubbles: true, cancelable: true });
        element.dispatchEvent(event);
        return { text: event.clipboardData!.getData("text/plain"), html: event.clipboardData!.getData("text/html"), prevented: event.defaultPrevented };
      },
      { selector, length },
    );

  try {
    let robots = await (await page.request.get("/robots.txt")).text();
    expect(robots).not.toContain("GPTBot");

    await createTutorialViaForm(page, { title, slug });
    writeDatabase(
      'UPDATE "Tutorial" SET content = ? WHERE slug = ?',
      `<p id="long">${paragraph}</p><pre><code class="language-bash">npm install --save some-package-with-a-long-name another-package-with-a-long-name</code></pre>`,
      slug,
    );
    await setToggles(true);

    robots = await (await page.request.get("/robots.txt")).text();
    expect(robots).toMatch(/User-Agent: GPTBot\n(User-Agent: .+\n)*Disallow: \//);
    for (const bot of ["ClaudeBot", "CCBot", "Google-Extended", "Bytespider"]) expect(robots).toContain(`User-Agent: ${bot}`);
    // 搜索引擎和 AI 搜索还在通用规则下：没有单独被拒绝
    for (const bot of ["Googlebot", "Baiduspider", "OAI-SearchBot", "Claude-SearchBot"]) expect(robots).not.toContain(bot);
    expect(robots).toContain("User-Agent: *\nAllow: /");

    await page.goto(`/tutorials/${slug}`);
    // page.goto 在 load 事件时返回，React 可能还没把复制事件接上（CI 上偶尔会这样）
    await expect(page.locator(".article-body[data-enhanced]")).toBeAttached();
    const body = await copy(".article-body p");
    expect(body.prevented).toBe(true);
    expect(body.text.startsWith(paragraph)).toBe(true);
    expect(body.text).toMatch(new RegExp(`\\n\\n来源：${title} https?://[^\\s]+/tutorials/${slug}$`));
    expect(body.html).toContain(`>${title}</a>`);
    // 代码块、少于 50 字：不加来源，交给浏览器默认复制
    const code = await copy(".article-body pre code");
    expect(code).toEqual({ text: "", html: "", prevented: false });
    const short = await copy(".article-body p", 10);
    expect(short).toEqual({ text: "", html: "", prevented: false });

    await setToggles(false);
    robots = await (await page.request.get("/robots.txt")).text();
    expect(robots).not.toContain("GPTBot");
    await page.goto(`/tutorials/${slug}`);
    await expect(page.locator(".article-body[data-enhanced]")).toBeAttached();
    expect((await copy(".article-body p")).prevented).toBe(false);
  } finally {
    await setToggles(false).catch(() => {});
    await deleteTutorialRow(page, title);
  }
});
