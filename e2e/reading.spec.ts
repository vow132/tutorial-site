import { expect, test } from "@playwright/test";
import { collectErrors } from "./helpers";

/** 种子数据里的示例文章：含多个 h2、带语言标记的代码块。 */
const ARTICLE = "/tutorials/css-flexbox-guide";

test.use({ permissions: ["clipboard-read", "clipboard-write"] });

const clipboard = (page: import("@playwright/test").Page) =>
  page.evaluate(() => navigator.clipboard.readText());

test("code blocks show the language and copy their code", async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto(ARTICLE);
  const block = page.locator(".article-body .code-block").first();
  await expect(block.locator(".code-lang")).toHaveText("CSS");

  await block.getByRole("button", { name: "复制代码" }).click();
  await expect(block.getByRole("button", { name: "复制代码" })).toHaveText("已复制");
  const code = (await block.locator("pre").innerText()).trim();
  expect((await clipboard(page)).trim()).toBe(code);
  expect(errors).toEqual([]);
});

test("headings get readable ids and the # anchor copies the section link", async ({ page }) => {
  await page.goto(ARTICLE);
  const heading = page.locator(".article-body h2").nth(1);
  const id = (await heading.getAttribute("id"))!;
  expect(id).toBe("容器与项目");
  // 右侧目录指向同一个 ID
  await expect(page.locator(`aside a[href="#${id}"]`)).toHaveCount(1);

  await heading.hover();
  await heading.locator(".heading-anchor").click();
  await expect(page.getByRole("status").filter({ hasText: "已复制本节链接" })).toBeVisible();
  expect(decodeURIComponent(await clipboard(page))).toMatch(new RegExp(`${ARTICLE}#${id}$`));
  expect(decodeURIComponent(new URL(page.url()).hash)).toBe(`#${id}`);
});

test("old #h-N links still land on the right section", async ({ page }) => {
  await page.goto(`${ARTICLE}#h-1`);
  await expect.poll(() => decodeURIComponent(new URL(page.url()).hash)).toBe("#容器与项目");
});

test("'/' and Ctrl+K focus the search box", async ({ page }) => {
  await page.goto(ARTICLE);
  const focusedName = () => page.evaluate(() => document.activeElement?.getAttribute("name"));

  await page.keyboard.press("/");
  expect(await focusedName()).toBe("q");
  // 输入框里再敲 / 是正常输入，不会被拦截
  await page.keyboard.type("a/b");
  expect(await page.evaluate(() => (document.activeElement as HTMLInputElement).value)).toBe("a/b");

  await page.locator(".article-body p").first().click();
  await page.keyboard.press("Control+k");
  expect(await focusedName()).toBe("q");
});

test("the 404 page offers search and the latest tutorials", async ({ page }) => {
  const response = await page.goto("/tutorials/e2e-missing-page");
  expect(response?.status()).toBe(404);
  await expect(page.locator("#not-found-search")).toBeVisible();
  await expect(page.getByRole("heading", { name: "最新教程" })).toBeVisible();
  await expect(page.locator('main a[href^="/tutorials/"]').first()).toBeVisible();
});

test("printing keeps the article and drops the site chrome", async ({ page }) => {
  await page.goto(ARTICLE);
  await page.emulateMedia({ media: "print" });
  const state = await page.evaluate(() => {
    const display = (selector: string) => {
      const element = document.querySelector(selector);
      return element ? getComputedStyle(element).display : "missing";
    };
    return {
      siteHeader: display("body > div header.print-hide, header.print-hide"),
      toc: display("main aside"),
      footer: display("footer"),
      title: display("main h1"),
      body: display(".article-body"),
      copyButton: display(".code-copy"),
      // 打印时仍占位却透明的元素（如未触发的渐显动画）；display:none 的不算
      invisible: [...document.querySelectorAll(".article-body *, main header, main header *")]
        .filter((element) => {
          const style = getComputedStyle(element);
          return style.opacity === "0" && style.display !== "none";
        })
        .map((element) => element.className || element.tagName),
    };
  });
  expect(state).toEqual({
    siteHeader: "none",
    toc: "none",
    footer: "none",
    title: "block",
    body: "block",
    copyButton: "none",
    invisible: [],
  });
});
