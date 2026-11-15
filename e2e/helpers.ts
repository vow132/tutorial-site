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
    if (message.type() === "error") errors.push(message.text());
  });
  return errors;
}

export function uniqueSuffix() {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}
