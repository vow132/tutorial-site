#!/usr/bin/env node
/**
 * SQLite 在线备份（不停站）：npm run backup
 * - 输出 backups/tutorial-YYYYMMDD-HHMMSS.db.gz，默认保留最近 14 份；
 * - 设置 BACKUP_PASSPHRASE（至少 12 个字符）后输出加密的 .db.gz.enc，用 npm run backup:restore 还原；
 * - BACKUP_DIR / BACKUP_KEEP 可覆盖目录与份数；
 * - 只备份数据库，上传目录 public/uploads 请用 rsync/rclone 同步到异地。
 * 建议 crontab 每天执行，并把备份目录同步到另一台机器或对象存储。
 */
import { createReadStream, createWriteStream } from "node:fs";
import { mkdir, readdir, rename, rm } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import { fileURLToPath } from "node:url";
import { createGzip } from "node:zlib";
import { notifyFromDatabase } from "../lib/alert-transport.mjs";
import { encryptStream, passphraseProblem } from "../lib/backup-crypto.mjs";
import { cliText, scriptText, siteLocaleOfFile } from "../lib/script-i18n.mjs";
import { databaseFile } from "./site-update.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(path.join(root, "package.json"));

try {
  const { config } = require("dotenv");
  if (process.env.NODE_ENV === "production") config({ path: path.join(root, ".env.production"), quiet: true });
  config({ path: path.join(root, ".env"), quiet: true });
} catch { /* dotenv 不可用时只使用 shell 环境变量 */ }

const Database = require("better-sqlite3");
const source = databaseFile(process.env.DATABASE_URL, root);
const directory = path.resolve(root, process.env.BACKUP_DIR || "backups");
const keep = Math.max(1, Number(process.env.BACKUP_KEEP) || 14);
const passphrase = process.env.BACKUP_PASSPHRASE ?? "";
const stamp = new Date().toISOString().replace(/[-:]/g, "").replace("T", "-").slice(0, 15);
const target = path.join(directory, `tutorial-${stamp}.db.gz${passphrase ? ".enc" : ""}`);
const snapshot = path.join(directory, `.tutorial-${stamp}.db.partial`);
// 输出跟网站语言：中文站点中文，其余英文；告警按网站语言（lib/script-i18n.mjs）
const locale = siteLocaleOfFile(Database, source);
const say = cliText(locale);

async function runBackup() {
  const problem = passphrase ? passphraseProblem(passphrase, say) : null;
  if (problem) throw new Error(problem);
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const db = new Database(source, { readonly: true, fileMustExist: true, timeout: 10_000 });
  try {
    await db.backup(snapshot);
  } finally {
    db.close();
  }
  try {
    const steps = [createReadStream(snapshot), createGzip({ level: 9 })];
    if (passphrase) steps.push(await encryptStream(passphrase));
    await pipeline(...steps, createWriteStream(`${target}.partial`, { mode: 0o600 }));
    await rename(`${target}.partial`, target);
  } finally {
    await rm(snapshot, { force: true });
    await rm(`${target}.partial`, { force: true });
  }

  const backups = (await readdir(directory)).filter((name) => /^tutorial-\d{8}-\d{6}\.db\.gz(\.enc)?$/.test(name)).sort().reverse();
  for (const name of backups.slice(keep)) await rm(path.join(directory, name), { force: true });

  console.log(
    say(
      `✅ 数据库已${passphrase ? "加密" : ""}备份到 ${target}（保留最近 ${keep} 份）`,
      `✅ Database backed up${passphrase ? " (encrypted)" : ""} to ${target} (keeping the latest ${keep})`,
    ),
  );
}

try {
  await runBackup();
} catch (error) {
  const reason = error instanceof Error ? error.message : String(error);
  console.error(say("❌ 数据库备份失败：", "❌ Database backup failed:"), reason);
  // 备份失败要让人知道：读取后台配置的安全告警渠道推送（数据库打不开时只能打印）。
  try {
    const alertDb = new Database(source, { readonly: true, fileMustExist: true, timeout: 10_000 });
    try {
      const t = scriptText(locale);
      await notifyFromDatabase(alertDb, {
        event: "backup.failed",
        title: t("backupFailed"),
        lines: [t("backupReason", { reason: reason.slice(0, 300) }), t("backupDatabase", { path: source }), t("backupDirectory", { path: directory })],
      });
    } finally {
      alertDb.close();
    }
  } catch {
    // 数据库本身打不开，无法读取告警配置
  }
  process.exitCode = 1;
}
