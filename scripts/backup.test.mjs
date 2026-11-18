import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const Database = createRequire(import.meta.url)("better-sqlite3");

/** 运行脚本；返回退出码和输出（不抛出）。 */
function run(script, args, env) {
  return new Promise((resolve) => {
    execFile(process.execPath, [path.join(root, "scripts", script), ...args], { cwd: root, env: { PATH: process.env.PATH, ...env } }, (error, stdout, stderr) =>
      resolve({ code: error ? error.code ?? 1 : 0, output: `${stdout}${stderr}` }),
    );
  });
}

async function fixture() {
  const dir = await mkdtemp(path.join(os.tmpdir(), "backup-test-"));
  const dbFile = path.join(dir, "site.db");
  const db = new Database(dbFile);
  db.exec('CREATE TABLE "Tutorial" (id INTEGER PRIMARY KEY, title TEXT); INSERT INTO "Tutorial" (title) VALUES (\'备份测试\'), (\'第二篇\');');
  db.close();
  const env = { DATABASE_URL: `file:${dbFile}`, BACKUP_DIR: path.join(dir, "backups") };
  return { dir, env };
}

const titles = (file) => {
  const db = new Database(file, { readonly: true });
  try {
    return db.prepare('SELECT title FROM "Tutorial" ORDER BY id').pluck().all();
  } finally {
    db.close();
  }
};

test("plain backups restore into a separate, verified database file", async () => {
  const { dir, env } = await fixture();
  try {
    assert.equal((await run("backup.mjs", [], env)).code, 0);
    const [name] = await readdir(env.BACKUP_DIR);
    assert.match(name, /^tutorial-\d{8}-\d{6}\.db\.gz$/);
    const restored = await run("backup-restore.mjs", [path.join(env.BACKUP_DIR, name)], env);
    assert.equal(restored.code, 0, restored.output);
    assert.match(restored.output, /完整性检查通过，共 2 篇教程/);
    assert.deepEqual(titles(path.join(env.BACKUP_DIR, `restored-${name.replace(/\.gz$/, "")}`)), ["备份测试", "第二篇"]);
    // 再还原一次不会覆盖已有文件
    assert.match((await run("backup-restore.mjs", [path.join(env.BACKUP_DIR, name)], env)).output, /已存在/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("encrypted backups need the passphrase and detect tampering", async () => {
  const { dir, env } = await fixture();
  const passphrase = "correct horse battery staple";
  try {
    assert.match((await run("backup.mjs", [], { ...env, BACKUP_PASSPHRASE: "short" })).output, /至少需要 12 个字符/);
    const made = await run("backup.mjs", [], { ...env, BACKUP_PASSPHRASE: passphrase });
    assert.equal(made.code, 0, made.output);
    const name = (await readdir(env.BACKUP_DIR)).find((item) => item.endsWith(".enc"));
    assert.ok(name, "an .enc backup was written");
    const file = path.join(env.BACKUP_DIR, name);
    const bytes = await readFile(file);
    assert.equal(bytes.subarray(0, 4).toString(), "TSBK");
    assert.ok(!bytes.includes(Buffer.from("备份测试")));

    assert.match((await run("backup-restore.mjs", [file], env)).output, /请设置 BACKUP_PASSPHRASE/);
    const wrong = await run("backup-restore.mjs", [file], { ...env, BACKUP_PASSPHRASE: "wrong passphrase!!" });
    assert.notEqual(wrong.code, 0);
    assert.match(wrong.output, /口令不对/);

    const tampered = path.join(dir, "tampered.db.gz.enc");
    const copy = Buffer.from(bytes);
    copy[copy.length - 40] ^= 1;
    await writeFile(tampered, copy);
    assert.match((await run("backup-restore.mjs", [tampered, "--output", path.join(dir, "t.db")], { ...env, BACKUP_PASSPHRASE: passphrase })).output, /口令不对|损坏/);

    const output = path.join(dir, "restored.db");
    const restored = await run("backup-restore.mjs", [file, "--output", output], { ...env, BACKUP_PASSPHRASE: passphrase });
    assert.equal(restored.code, 0, restored.output);
    assert.deepEqual(titles(output), ["备份测试", "第二篇"]);
    // 失败的还原不会留下半成品
    assert.deepEqual((await readdir(dir)).filter((item) => item.endsWith(".partial")), []);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
