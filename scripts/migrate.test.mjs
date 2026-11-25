import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { cpSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { applyMigrations, databasePath } from "./migrate.mjs";

const require = createRequire(import.meta.url);
const Database = require("better-sqlite3");
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const migrations = path.join(root, "prisma", "migrations");

function query(file, sql) {
  const db = new Database(file, { readonly: true });
  try {
    return db.prepare(sql).all();
  } finally {
    db.close();
  }
}

const schema = (file) =>
  query(file, "SELECT type, name, tbl_name, sql FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' ORDER BY type, name");
const records = (file) =>
  query(
    file,
    "SELECT migration_name, checksum, applied_steps_count, logs, rolled_back_at, typeof(started_at) AS started, typeof(finished_at) AS finished FROM _prisma_migrations ORDER BY migration_name",
  );

function prisma(args, file) {
  return spawnSync(process.execPath, [path.join(root, "node_modules", "prisma", "build", "index.js"), ...args], {
    cwd: root,
    env: { ...process.env, NODE_ENV: "test", DATABASE_URL: `file:${file}`, PRISMA_HIDE_UPDATE_MESSAGE: "1" },
    encoding: "utf8",
  });
}

test("the Docker migration script builds exactly what prisma migrate deploy builds, and Prisma accepts its records", () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), "migrate-"));
  try {
    const ours = path.join(dir, "ours.db");
    const theirs = path.join(dir, "theirs.db");
    const applied = applyMigrations(ours, migrations);
    assert.ok(applied.length > 10, "all migrations run on a new database");
    const deploy = prisma(["migrate", "deploy"], theirs);
    assert.equal(deploy.status, 0, deploy.stderr || deploy.stdout);

    assert.deepEqual(schema(ours), schema(theirs), "same tables, indexes, triggers and full-text search tables");
    assert.deepEqual(records(ours), records(theirs), "same migration records (names, checksums, timestamp format)");

    // Prisma 认为脚本迁移过的库是最新的；Prisma 迁移过的库脚本也不会重复执行
    const status = prisma(["migrate", "status"], ours);
    assert.equal(status.status, 0, status.stdout + status.stderr);
    assert.match(status.stdout, /up to date/);
    assert.deepEqual(applyMigrations(theirs, migrations), []);
    assert.deepEqual(applyMigrations(ours, migrations), []);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("only new migrations run, and a failed migration blocks later runs until it is resolved", () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), "migrate-"));
  try {
    const local = path.join(dir, "migrations");
    cpSync(migrations, local, { recursive: true });
    const file = path.join(dir, "data", "site.db");
    applyMigrations(file, local);

    mkdirSync(path.join(local, "99990101000000_add_note"));
    writeFileSync(path.join(local, "99990101000000_add_note", "migration.sql"), 'ALTER TABLE "Tutorial" ADD COLUMN "note" TEXT;\n');
    assert.deepEqual(applyMigrations(file, local), ["99990101000000_add_note"]);

    mkdirSync(path.join(local, "99990102000000_broken"));
    writeFileSync(path.join(local, "99990102000000_broken", "migration.sql"), "CREATE TABLE oops (;\n");
    assert.throws(() => applyMigrations(file, local), /99990102000000_broken 执行失败/);
    const [failed] = query(file, "SELECT logs, finished_at FROM _prisma_migrations WHERE migration_name = '99990102000000_broken'");
    assert.equal(failed.finished_at, null);
    assert.match(failed.logs, /syntax error/);
    assert.throws(() => applyMigrations(file, local), /执行失败的迁移：99990102000000_broken/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("DATABASE_URL is resolved like the app resolves it", () => {
  assert.equal(databasePath("file:/app/data/tutorial.db", "/srv"), "/app/data/tutorial.db");
  assert.equal(databasePath("file:./prisma/dev.db?connection_limit=1", "/srv/site"), "/srv/site/prisma/dev.db");
  assert.throws(() => databasePath("postgresql://localhost/db"), /SQLite/);
});
