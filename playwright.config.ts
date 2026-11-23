import { defineConfig, devices } from "@playwright/test";

/**
 * 端到端测试：针对生产构建运行（先 `npm run build`，再 `npm run test:e2e`）。
 * 测试会在数据库里新建并删除带 e2e- 前缀的教程/分类，请勿指向生产数据库。
 */
const PORT = Number(process.env.E2E_PORT ?? 3100);

/**
 * 测试服务器的 SITE_URL：通行密钥（WebAuthn）要求域名，不接受 IP，所以用 localhost；
 * 通行密钥测试以 http://localhost 访问，其余测试仍用 127.0.0.1。
 */
const SITE_URL = process.env.SITE_URL ?? `http://localhost:${PORT}`;
const serverEnv = Object.fromEntries(
  // 定时发布每 2 秒检查一次（默认 60 秒），测试不用等一分钟
  Object.entries({ SCHEDULE_CHECK_SECONDS: "2", ...process.env, SITE_URL }).filter((entry): entry is [string, string] => entry[1] !== undefined),
);

export default defineConfig({
  testDir: "./e2e",
  // 共用一个 SQLite 数据库和登录状态，串行执行最稳定。
  fullyParallel: false,
  workers: 1,
  forbidOnly: Boolean(process.env.CI),
  retries: 0,
  reporter: process.env.CI ? [["list"], ["github"]] : "list",
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    trace: "off",
  },
  projects: [
    { name: "setup", testMatch: /auth\.setup\.ts/ },
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
      dependencies: ["setup"],
    },
    // 会删掉种子数据的测试（结束时重新写入），等其他测试都跑完再执行
    {
      name: "cleanup",
      testMatch: /\.cleanup\.ts$/,
      use: { ...devices["Desktop Chrome"] },
      dependencies: ["chromium"],
    },
  ],
  webServer: {
    command: `npm run start -- -p ${PORT}`,
    url: `http://127.0.0.1:${PORT}/robots.txt`,
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
    env: serverEnv,
  },
});
