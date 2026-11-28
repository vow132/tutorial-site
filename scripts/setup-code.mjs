#!/usr/bin/env node
/**
 * 打印首次安装（/admin/setup）用的安装码：启动日志里找不到时用。
 *   npm run setup:code
 *   docker compose exec -u node app npm run setup:code
 * 已经有后台账号时安装页是关闭的，这时提示改用 npm run admin:reset。
 */
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { setupHint } from "../lib/setup-code.mjs";
import { databaseFile } from "./site-update.mjs";
import { cliText, siteLocaleFrom } from "../lib/script-i18n.mjs";

const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
try {
  const { config } = require("dotenv");
  if (process.env.NODE_ENV === "production") config({ path: path.join(root, ".env.production"), quiet: true });
  config({ path: path.join(root, ".env"), quiet: true });
} catch {
  // Docker 镜像里环境变量由 docker compose 传入
}

let admins = 0;
let locale = null;
try {
  const Database = require("better-sqlite3");
  const db = new Database(databaseFile(process.env.DATABASE_URL, root), { readonly: true, fileMustExist: true });
  try {
    locale = siteLocaleFrom(db);
    admins = db.prepare('SELECT COUNT(*) AS n FROM "Admin"').get().n;
  } finally {
    db.close();
  }
} catch {
  // 数据库还没建好：当作还没有账号
}

if (admins > 0) {
  console.log(
    cliText(locale)(
      "ℹ️ 已经有后台账号，安装页已关闭。忘记密码请运行 npm run admin:reset（Docker：docker compose exec -u node app npm run admin:reset）。",
      "ℹ️ An admin account already exists, so the setup page is closed. If you forgot the password, run npm run admin:reset (Docker: docker compose exec -u node app npm run admin:reset).",
    ),
  );
} else {
  console.log(setupHint(process.env.SITE_URL || "http://localhost:3000"));
}
