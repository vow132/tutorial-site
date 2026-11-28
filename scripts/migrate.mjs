#!/usr/bin/env node
/**
 * 执行数据库迁移，等同于 SQLite 下的 `prisma migrate deploy`（Docker 镜像用）。
 *
 * Prisma 命令行连同依赖有 240MB 左右，镜像里只为了启动时执行迁移带上它太浪费，所以镜像里用这个脚本；
 * PM2 部署（deploy.sh、一键更新）照常用 Prisma 命令行。两边读写同一张 `_prisma_migrations` 表、
 * 格式完全一致（建表语句、sha256 校验和、毫秒时间戳），同一个数据库换着用也没问题（scripts/migrate.test.mjs 有对照测试）。
 *
 * 规则和 Prisma 一致：按目录名顺序执行 prisma/migrations 下还没执行过的 migration.sql；脚本不包在事务里
 * （迁移里的 PRAGMA foreign_keys=OFF 在事务里不生效）；执行失败的迁移会留下记录，之后拒绝继续迁移，
 * 要人工处理（和 Prisma 的 P3009 一样）。
 *
 * 用法：node scripts/migrate.mjs（数据库地址取 DATABASE_URL，相对路径按当前目录）
 */
import { createHash, randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { cliText, siteLocaleOfFile } from "../lib/script-i18n.mjs";

const require = createRequire(import.meta.url);

/** 和 Prisma 建的表一模一样（包括空白），sqlite_master 里看起来也一致。 */
const MIGRATIONS_TABLE = `CREATE TABLE "_prisma_migrations" (
    "id"                    TEXT PRIMARY KEY NOT NULL,
    "checksum"              TEXT NOT NULL,
    "finished_at"           DATETIME,
    "migration_name"        TEXT NOT NULL,
    "logs"                  TEXT,
    "rolled_back_at"        DATETIME,
    "started_at"            DATETIME NOT NULL DEFAULT current_timestamp,
    "applied_steps_count"   INTEGER UNSIGNED NOT NULL DEFAULT 0
)`;

/** DATABASE_URL（file:…）对应的文件路径，规则和 lib/database-url.ts 一致。 */
export function databasePath(url = process.env.DATABASE_URL?.trim() || "file:./prisma/dev.db", cwd = process.cwd()) {
  if (!url.startsWith("file:")) throw new Error(`只支持 SQLite 的 file: 地址 / Only SQLite file: URLs are supported: ${url}`);
  const file = url.slice("file:".length).split("?")[0];
  return path.isAbsolute(file) ? file : path.resolve(cwd, file);
}

/**
 * 执行还没执行过的迁移，返回这次执行的迁移名。
 * @param {string} dbFile
 * @param {string} migrationsDir
 * @param {(zh: string, en: string) => string} [say] 命令行文字（lib/script-i18n.mjs 的 cliText），默认中文
 */
export function applyMigrations(dbFile, migrationsDir, say = (zh) => zh) {
  const Database = require("better-sqlite3");
  mkdirSync(path.dirname(dbFile), { recursive: true });
  const db = new Database(dbFile);
  try {
    const hasTable = db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = '_prisma_migrations'").get();
    if (!hasTable) db.exec(MIGRATIONS_TABLE);

    const failed = db
      .prepare("SELECT migration_name FROM _prisma_migrations WHERE finished_at IS NULL AND rolled_back_at IS NULL")
      .pluck()
      .all();
    if (failed.length) {
      throw new Error(
        say(
          `数据库里有执行失败的迁移：${failed.join("、")}。先查明原因并修好数据库，再用 ` +
            "`npx prisma migrate resolve --rolled-back <迁移名>`（或 --applied）标记后重试。",
          `The database has failed migrations: ${failed.join(", ")}. Find the cause and fix the database, then mark them with ` +
            "`npx prisma migrate resolve --rolled-back <migration>` (or --applied) and try again.",
        ),
      );
    }
    const applied = new Set(
      db
        .prepare("SELECT migration_name FROM _prisma_migrations WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL")
        .pluck()
        .all(),
    );
    const pending = readdirSync(migrationsDir, { withFileTypes: true })
      .filter((entry) => entry.isDirectory() && existsSync(path.join(migrationsDir, entry.name, "migration.sql")))
      .map((entry) => entry.name)
      .sort()
      .filter((name) => !applied.has(name));

    const insert = db.prepare(
      "INSERT INTO _prisma_migrations (id, checksum, migration_name, started_at, applied_steps_count) VALUES (?, ?, ?, ?, 0)",
    );
    const fail = db.prepare("UPDATE _prisma_migrations SET logs = ? WHERE id = ?");
    const finish = db.prepare("UPDATE _prisma_migrations SET finished_at = ?, applied_steps_count = 1 WHERE id = ?");
    for (const name of pending) {
      const script = readFileSync(path.join(migrationsDir, name, "migration.sql"));
      const id = randomUUID();
      insert.run(id, createHash("sha256").update(script).digest("hex"), name, Date.now());
      try {
        db.exec(script.toString("utf8"));
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        fail.run(message, id);
        throw new Error(say(`迁移 ${name} 执行失败：${message}`, `Migration ${name} failed: ${message}`));
      }
      finish.run(Date.now(), id);
    }
    return pending;
  } finally {
    db.close();
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  // 输出跟网站语言：中文站点中文，其余英文，新库（还不知道语言）中英文都输出
  let say = cliText(null);
  try {
    const dbFile = databasePath();
    say = cliText(siteLocaleOfFile(require("better-sqlite3"), dbFile));
    const done = applyMigrations(dbFile, path.join(root, "prisma", "migrations"), say);
    console.log(
      done.length
        ? say(`✅ 已执行 ${done.length} 个数据库迁移：${done.join("、")}`, `✅ Applied ${done.length} database migration(s): ${done.join(", ")}`)
        : say("✅ 数据库已是最新，没有要执行的迁移", "✅ The database is up to date; no migrations to apply"),
    );
  } catch (error) {
    console.error(`❌ ${error instanceof Error ? error.message : error}`);
    process.exit(1);
  }
}
