import type { Page } from "@playwright/test";

export const ADMIN_STATE = "e2e/.auth/admin.json";

export const admin = {
  username: process.env.E2E_ADMIN_USERNAME ?? process.env.ADMIN_USERNAME ?? "admin",
  password: process.env.E2E_ADMIN_PASSWORD ?? process.env.ADMIN_PASSWORD ?? "admin123456",
};

/** 收集页面脚本错误和 console.error（含 CSP 违规），测试结束时断言为空。 */
export function collectErrors(page: Page) {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() !== "error") return;
    const { url } = message.location();
    errors.push(url ? `${message.text()} (${url})` : message.text());
  });
  return errors;
}

export function uniqueSuffix() {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

/**
 * 只读查询测试服务器正在用的 SQLite（同一台机器），用来断言存库的形式（比如是否已加密）。
 * 本地未设置 DATABASE_URL 时与 Prisma 默认一致：prisma/dev.db。
 */
export function queryDatabase<T>(sql: string, ...params: unknown[]): T | undefined {
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- 测试里按需加载原生模块
  const Database = require("better-sqlite3");
  const url = (process.env.DATABASE_URL ?? "file:./prisma/dev.db").replace(/^file:/, "").split("?")[0];
  const db = new Database(url, { readonly: true, fileMustExist: true });
  try {
    return db.prepare(sql).get(...params) as T | undefined;
  } finally {
    db.close();
  }
}

/** 在测试服务器用的 SQLite 上执行一条写语句（只用于清理测试数据），返回改动的行数。 */
export function writeDatabase(sql: string, ...params: unknown[]): number {
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- 测试里按需加载原生模块
  const Database = require("better-sqlite3");
  const url = (process.env.DATABASE_URL ?? "file:./prisma/dev.db").replace(/^file:/, "").split("?")[0];
  const db = new Database(url, { fileMustExist: true, timeout: 5000 });
  try {
    return db.prepare(sql).run(...params).changes as number;
  } finally {
    db.close();
  }
}

/** 通过后台表单新建一篇教程（正文一次性插入，比逐字输入快）。 */
export async function createTutorialViaForm(
  page: Page,
  data: { title: string; slug: string; body?: string; series?: string; draft?: boolean },
) {
  await page.goto("/admin/tutorials/new");
  await page.locator(".ProseMirror").waitFor();
  await page.fill('input[name="title"]', data.title);
  await page.fill('input[name="slug"]', data.slug);
  await page.locator('select[name="categoryId"]').selectOption({ index: 1 });
  if (data.series) await page.locator('select[name="seriesId"]').selectOption({ label: data.series });
  await page.locator(".ProseMirror").click();
  await page.keyboard.insertText(data.body ?? `${data.title} 的正文`);
  if (data.draft) await page.getByLabel("存为草稿").check();
  await page.getByRole("button", { name: "保存教程" }).click();
  await page.waitForURL(/\/admin\/tutorials(\?saved=[\w-]+)?$/);
}

/** 在后台列表里删除教程（不存在时跳过），用于测试清理。 */
export async function deleteTutorialRow(page: Page, title: string) {
  await page.goto(`/admin/tutorials?q=${encodeURIComponent(title)}`);
  const row = page.getByRole("row").filter({ hasText: title });
  if (!(await row.count())) return;
  page.once("dialog", (dialog) => dialog.accept());
  await row.getByRole("button", { name: "删除" }).click();
  await row.waitFor({ state: "detached" });
}
