#!/usr/bin/env node
/**
 * 清理没人引用的上传图片：npm run uploads:clean            # 只列出，不动文件
 *                          npm run uploads:clean -- --apply # 移到上传目录里的 .trash/<时间>/，确认无误后再自己删
 *
 * 「引用」包括：教程正文、封面、列表缩略图、历史版本、站点设置和关于页面里出现的 /uploads/ 文件名
 * （判断规则在 lib/upload-refs.mjs，和后台「图片库」共用）。响应式小图（-400w/-800w/-1200w.webp）跟着原图走。
 * 最近 7 天内上传的文件一律保留（可能在还没保存的草稿里），可用 --min-age-days 调整。
 */
import { mkdir, readdir, rename, stat } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { databaseFile } from "./site-update.mjs";
import { RECENT_UPLOAD_DAYS, referencedStems, trashDir, uploadStem } from "../lib/upload-refs.mjs";
import { cliText, siteLocaleOfFile } from "../lib/script-i18n.mjs";

export { referencedStems, uploadStem };

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(path.join(root, "package.json"));

try {
  const { config } = require("dotenv");
  if (process.env.NODE_ENV === "production") config({ path: path.join(root, ".env.production"), quiet: true });
  config({ path: path.join(root, ".env"), quiet: true });
} catch { /* dotenv 不可用时只使用 shell 环境变量 */ }

function readReferences(dbFile) {
  const Database = require("better-sqlite3");
  const db = new Database(dbFile, { readonly: true, fileMustExist: true });
  try {
    const tables = new Set(db.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").pluck().all());
    const texts = [];
    for (const row of db.prepare('SELECT "content", "cover", "thumbnail" FROM "Tutorial"').iterate()) {
      texts.push(row.content, row.cover, row.thumbnail);
    }
    if (tables.has("TutorialRevision")) {
      for (const content of db.prepare('SELECT "content" FROM "TutorialRevision"').pluck().iterate()) texts.push(content);
    }
    for (const value of db.prepare('SELECT "value" FROM "Setting"').pluck().iterate()) texts.push(value);
    return referencedStems(texts);
  } finally {
    db.close();
  }
}

export async function findUnusedUploads({ uploadsDir, dbFile, minAgeDays = RECENT_UPLOAD_DAYS, now = Date.now() }) {
  const referenced = readReferences(dbFile);
  const names = (await readdir(uploadsDir).catch(() => [])).filter((name) => !name.startsWith("."));
  const unused = [];
  for (const name of names) {
    const info = await stat(path.join(uploadsDir, name)).catch(() => null);
    if (!info?.isFile()) continue;
    if (now - info.mtimeMs < minAgeDays * 24 * 60 * 60 * 1000) continue;
    if (!referenced.has(uploadStem(name))) unused.push({ name, size: info.size });
  }
  return unused.sort((a, b) => a.name.localeCompare(b.name));
}

async function main() {
  const { values } = parseArgs({
    options: {
      apply: { type: "boolean", default: false },
      "min-age-days": { type: "string", default: String(RECENT_UPLOAD_DAYS) },
      uploads: { type: "string" },
    },
  });
  const uploadsDir = path.resolve(values.uploads ?? path.join(root, "public", "uploads"));
  const dbFile = databaseFile(process.env.DATABASE_URL, root);
  // 输出跟网站语言：中文站点中文，其余英文
  const say = cliText(siteLocaleOfFile(require("better-sqlite3"), dbFile));
  const minAgeDays = Math.max(0, Number(values["min-age-days"]) || 0);
  const unused = await findUnusedUploads({ uploadsDir, dbFile, minAgeDays });
  const total = unused.reduce((sum, item) => sum + item.size, 0);
  const mb = (bytes) => `${(bytes / 1024 / 1024).toFixed(1)} MB`;

  if (unused.length === 0) {
    console.log(say(`✅ 没有需要清理的图片（${minAgeDays} 天内上传的不计）`, `✅ No images to clean up (uploads from the last ${minAgeDays} days are skipped)`));
    return;
  }
  for (const item of unused) console.log(`  ${item.name}  ${(item.size / 1024).toFixed(0)} KB`);
  console.log(
    say(
      `\n共 ${unused.length} 个文件没有被任何教程、历史版本或设置引用，合计 ${mb(total)}。`,
      `\n${unused.length} file(s) aren't used by any tutorial, revision or setting, ${mb(total)} in total.`,
    ),
  );
  if (!values.apply) {
    console.log(say("这次只是列出。确认后运行 npm run uploads:clean -- --apply 移到回收目录。", "This only lists them. Once you've checked, run npm run uploads:clean -- --apply to move them to the trash folder."));
    return;
  }
  // 回收目录在上传目录里：Docker 下上传目录是挂载卷，移到卷外面会跨文件系统失败（EXDEV），容器重建也会丢
  const trash = trashDir(uploadsDir);
  await mkdir(trash, { recursive: true, mode: 0o700 });
  for (const item of unused) await rename(path.join(uploadsDir, item.name), path.join(trash, item.name));
  console.log(say(`✅ 已移到 ${trash}`, `✅ Moved to ${trash}`));
  console.log(
    say(
      `   有问题时把文件移回 ${uploadsDir} 即可；确认无误后可删除整个回收目录。`,
      `   If something breaks, move the files back to ${uploadsDir}; once you're sure, delete the whole trash folder.`,
    ),
  );
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(`❌ ${error instanceof Error ? error.message : error}`);
    process.exitCode = 1;
  });
}
