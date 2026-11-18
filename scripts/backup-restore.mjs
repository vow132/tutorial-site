#!/usr/bin/env node
/**
 * 还原数据库备份：npm run backup:restore -- backups/tutorial-20261117-030000.db.gz.enc
 * - 支持 npm run backup 生成的 .db.gz 和加密的 .db.gz.enc（口令取 BACKUP_PASSPHRASE）；
 * - 只把备份解出为一个独立的 .db 文件并做完整性检查，不会动正在使用的数据库；
 *   确认无误后按输出的步骤停站替换。--output 指定输出路径。
 */
import { createReadStream, createWriteStream } from "node:fs";
import { access, rename, rm } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { createGunzip } from "node:zlib";
import { isEncryptedBackup, openEncryptedBackup } from "../lib/backup-crypto.mjs";
import { databaseFile } from "./site-update.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(path.join(root, "package.json"));

try {
  const { config } = require("dotenv");
  if (process.env.NODE_ENV === "production") config({ path: path.join(root, ".env.production"), quiet: true });
  config({ path: path.join(root, ".env"), quiet: true });
} catch { /* dotenv 不可用时只使用 shell 环境变量 */ }

const exists = (file) => access(file).then(() => true, () => false);

async function main() {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: { output: { type: "string", short: "o" } },
  });
  const input = positionals[0];
  if (!input) {
    throw new Error("用法：npm run backup:restore -- <备份文件> [--output 还原后的.db路径]");
  }
  const source = path.resolve(input);
  if (!(await exists(source))) throw new Error(`找不到备份文件：${source}`);

  const output = path.resolve(
    values.output ?? path.join(path.dirname(source), `restored-${path.basename(source).replace(/\.gz(\.enc)?$/, "")}`),
  );
  if (!output.endsWith(".db")) throw new Error("输出文件名需要以 .db 结尾");
  if (await exists(output)) throw new Error(`输出文件已存在，为避免覆盖已停止：${output}`);

  const partial = `${output}.partial`;
  const encrypted = await isEncryptedBackup(source);
  try {
    if (encrypted) {
      const passphrase = process.env.BACKUP_PASSPHRASE ?? "";
      if (!passphrase) throw new Error("这是加密备份，请设置 BACKUP_PASSPHRASE（与备份时相同的口令）后重试");
      const { source: cipherText, decipher } = await openEncryptedBackup(source, passphrase);
      try {
        await pipeline(cipherText, decipher, createGunzip(), createWriteStream(partial, { mode: 0o600 }));
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        throw new Error(
          /authenticate|bad decrypt/i.test(message) ? "口令不对，或备份文件已损坏/被改动" : message,
        );
      }
    } else {
      await pipeline(createReadStream(source), createGunzip(), createWriteStream(partial, { mode: 0o600 }));
    }

    const Database = require("better-sqlite3");
    const db = new Database(partial, { readonly: true, fileMustExist: true });
    let tutorials = null;
    try {
      const check = db.prepare("PRAGMA integrity_check").pluck().get();
      if (check !== "ok") throw new Error(`完整性检查未通过：${check}`);
      try {
        tutorials = db.prepare('SELECT COUNT(*) FROM "Tutorial"').pluck().get();
      } catch {
        // 不是本站的数据库结构时不统计
      }
    } finally {
      db.close();
    }
    await rename(partial, output);

    const live = databaseFile(process.env.DATABASE_URL, root);
    console.log(`✅ 已还原到 ${output}（完整性检查通过${tutorials === null ? "" : `，共 ${tutorials} 篇教程`}）`);
    console.log("\n如需用它替换线上数据库（会丢失备份时间点之后的改动）：");
    console.log("  1. npm run backup                         # 先给当前数据库留一份备份");
    console.log("  2. pm2 stop 教程网                          # 停站（进程名以 pm2 list 为准）");
    console.log(`  3. rm -f "${live}-wal" "${live}-shm"`);
    console.log(`  4. cp "${output}" "${live}"`);
    console.log("  5. pm2 start 教程网");
  } finally {
    await rm(partial, { force: true });
  }
}

main().catch((error) => {
  console.error(`❌ ${error instanceof Error ? error.message : error}`);
  process.exitCode = 1;
});
