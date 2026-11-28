import { defineConfig, devices } from "@playwright/test";

/**
 * 端到端测试：针对生产构建运行（先 `npm run build`，再 `npm run test:e2e`）。
 * 测试会在数据库里新建并删除带 e2e- 前缀的教程/分类，请勿指向生产数据库。
 */
/**
 * E2E_DEMO=1：只跑演示模式的测试（e2e/demo.spec.ts），服务器以 DEMO_MODE=true 启动在另一个端口。
 * 不和普通测试同时跑：两个服务器共用 .next 里的页面缓存，演示横幅会混进普通页面。
 */
const DEMO = process.env.E2E_DEMO === "1";
/**
 * E2E_SETUP=1：只跑首次安装的测试（e2e/setup.spec.ts）。服务器用一个全新的、没有后台账号的数据库
 * （启动前由 e2e/fresh-setup-db.mjs 建好），测试进程查询的也是这个库。
 */
const SETUP = process.env.E2E_SETUP === "1";
const SETUP_DB = "prisma/e2e-setup.db";
if (SETUP) process.env.DATABASE_URL = `file:./${SETUP_DB}`;
// 和 e2e/helpers.ts 的 admin 一致（这里不能 import e2e/ 下的文件：Docker 构建时没有这个目录，类型检查会失败）
const ADMIN_USERNAME = process.env.E2E_ADMIN_USERNAME ?? process.env.ADMIN_USERNAME ?? "admin";
const ADMIN_PASSWORD = process.env.E2E_ADMIN_PASSWORD ?? process.env.ADMIN_PASSWORD ?? "admin123456";
const PORT = Number(process.env.E2E_PORT ?? (DEMO ? 3101 : SETUP ? 3102 : 3100));

/**
 * 测试服务器的 SITE_URL：通行密钥（WebAuthn）要求域名，不接受 IP，所以用 localhost；
 * 通行密钥测试以 http://localhost 访问，其余测试仍用 127.0.0.1。
 */
const SITE_URL = process.env.SITE_URL ?? `http://localhost:${PORT}`;
/** 人机验证的假 siteverify（e2e/cloudflare.spec.ts 在这个端口起一个本机服务器；只接受本机地址，见 lib/turnstile.ts） */
const TURNSTILE_PORT = Number(process.env.E2E_TURNSTILE_PORT ?? 3190);
const serverEnv = Object.fromEntries(
  // 定时发布每 2 秒检查一次（默认 60 秒），测试不用等一分钟
  Object.entries({
    SCHEDULE_CHECK_SECONDS: "2",
    ...process.env,
    SITE_URL,
    TURNSTILE_VERIFY_URL: `http://127.0.0.1:${TURNSTILE_PORT}/siteverify`,
    // 演示模式：登录页公开的演示账号就是测试用的管理员
    ...(DEMO ? { DEMO_MODE: "true", ADMIN_USERNAME, ADMIN_PASSWORD } : {}),
  }).filter((entry): entry is [string, string] => entry[1] !== undefined),
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
    // 测试按中文界面写（首次安装页按浏览器语言显示，其他页面跟网站语言）；多语言另见 e2e/i18n.spec.ts
    locale: "zh-CN",
  },
  projects: DEMO
    ? [{ name: "demo", testMatch: /demo\.spec\.ts$/, use: { ...devices["Desktop Chrome"] } }]
    : SETUP
    ? [{ name: "setup-wizard", testMatch: /setup\.spec\.ts$/, use: { ...devices["Desktop Chrome"] } }]
    : [
        { name: "setup", testMatch: /auth\.setup\.ts/ },
        {
          name: "chromium",
          testIgnore: /(demo|setup)\.spec\.ts$/,
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
    command: SETUP ? `node e2e/fresh-setup-db.mjs ${SETUP_DB} && npm run start -- -p ${PORT}` : `npm run start -- -p ${PORT}`,
    url: `http://127.0.0.1:${PORT}/robots.txt`,
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
    env: serverEnv,
  },
});
