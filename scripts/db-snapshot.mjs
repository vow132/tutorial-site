#!/usr/bin/env node
/**
 * 把正在使用的 SQLite 数据库在线复制一份（不停站，WAL 下也能拿到一致的快照）：
 *   node scripts/db-snapshot.mjs <目标文件>
 * deploy.sh 用它在站点运行时先对副本执行迁移和构建，只在最后迁移正式库时短暂停站。
 */
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { databaseFile } from "./site-update.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(path.join(root, "package.json"));

try {
  const { config } = require("dotenv");
  if (process.env.NODE_ENV === "production") config({ path: path.join(root, ".env.production"), quiet: true });
  config({ path: path.join(root, ".env"), quiet: true });
} catch { /* dotenv 不可用时只使用 shell 环境变量 */ }

const target = process.argv[2];
if (!target) {
  console.error("用法：node scripts/db-snapshot.mjs <目标文件>");
  process.exit(1);
}

const Database = require("better-sqlite3");
const source = databaseFile(process.env.DATABASE_URL, root);
const db = new Database(source, { readonly: true, fileMustExist: true, timeout: 10_000 });
try {
  await db.backup(path.resolve(target));
} finally {
  db.close();
}
console.log(`数据库快照：${source} → ${path.resolve(target)}`);
