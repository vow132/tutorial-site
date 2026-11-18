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
