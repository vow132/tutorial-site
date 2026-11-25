#!/usr/bin/env node
/**
 * E2E_SETUP=1 的测试服务器启动前执行（playwright.config.ts 的 webServer.command）：
 * 建一个全新的数据库，写入示例数据但不建后台账号（相当于生产环境没设 ADMIN_PASSWORD 的第一次部署），
 * 用来测试首次安装页 /admin/setup。用法：node e2e/fresh-setup-db.mjs <数据库文件>
 */
import { spawnSync } from "node:child_process";
import { rmSync } from "node:fs";
import path from "node:path";

const file = path.resolve(process.argv[2] ?? "prisma/e2e-setup.db");
for (const suffix of ["", "-wal", "-shm", "-journal"]) rmSync(file + suffix, { force: true });

const env = { ...process.env, DATABASE_URL: `file:${file}`, NODE_ENV: "production" };
// 一定不能带上管理员密码（CI 的环境变量里有），否则种子数据会直接建好账号
delete env.ADMIN_PASSWORD;
delete env.ADMIN_USERNAME;

for (const args of [["scripts/migrate.mjs"], ["--import", "tsx", "prisma/seed.ts"]]) {
  const result = spawnSync(process.execPath, args, { env, stdio: "inherit" });
  if (result.status !== 0) process.exit(result.status ?? 1);
}
