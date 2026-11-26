import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readdir, rm, utimes, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { findUnusedUploads, referencedStems, uploadStem } from "./uploads-clean.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const Database = createRequire(import.meta.url)("better-sqlite3");

test("variants map to their original and references are found anywhere in text", () => {
  assert.equal(uploadStem("17-ab.webp"), "17-ab");
  assert.equal(uploadStem("17-ab-400w.webp"), "17-ab");
  assert.equal(uploadStem("17-ab.gif"), "17-ab");
  assert.deepEqual(
    [...referencedStems(['<img src="/uploads/a.webp">', null, '{"content":"x /uploads/b-800w.webp"}'])].sort(),
    ["a", "b"],
  );
});

test("only old, unreferenced uploads are reported, and --apply moves them to the trash", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "uploads-clean-"));
  const uploads = path.join(dir, "public", "uploads");
  await mkdir(uploads, { recursive: true });
  const dbFile = path.join(dir, "site.db");
  const db = new Database(dbFile);
  db.exec(`
    CREATE TABLE "Tutorial" (id INTEGER PRIMARY KEY, content TEXT, cover TEXT, thumbnail TEXT);
    CREATE TABLE "TutorialRevision" (id INTEGER PRIMARY KEY, content TEXT);
    CREATE TABLE "Setting" (key TEXT PRIMARY KEY, value TEXT);
    INSERT INTO "Tutorial" VALUES (1, '<p><img src="/uploads/body.webp"></p>', '/uploads/cover.webp', '/uploads/cover-400w.webp');
    INSERT INTO "TutorialRevision" VALUES (1, '<img src="/uploads/old-version.png">');
    INSERT INTO "Setting" VALUES ('about', '{"content":"<img src=\\"/uploads/about.webp\\">"}');
  `);
  db.close();

  const old = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const files = ["body.webp", "body-800w.webp", "cover.webp", "cover-400w.webp", "old-version.png", "about.webp", "orphan.webp", "orphan-400w.webp", "fresh.webp"];
  for (const name of files) {
    await writeFile(path.join(uploads, name), "x");
    if (name !== "fresh.webp") await utimes(path.join(uploads, name), old, old);
  }

  try {
    const unused = await findUnusedUploads({ uploadsDir: uploads, dbFile });
    assert.deepEqual(unused.map((item) => item.name), ["orphan-400w.webp", "orphan.webp"]);

    const run = (args) =>
      new Promise((resolve) =>
        execFile(process.execPath, [path.join(root, "scripts", "uploads-clean.mjs"), "--uploads", uploads, ...args], {
          env: { PATH: process.env.PATH, DATABASE_URL: `file:${dbFile}` },
        }, (error, stdout) => resolve({ code: error ? 1 : 0, stdout })),
      );
    const dry = await run([]);
    assert.equal(dry.code, 0);
    assert.match(dry.stdout, /共 2 个文件/);
    assert.ok((await readdir(uploads)).includes("orphan.webp"), "dry run keeps files");

    const applied = await run(["--apply"]);
    assert.equal(applied.code, 0, applied.stdout);
    const left = await readdir(uploads);
    assert.ok(!left.includes("orphan.webp") && !left.includes("orphan-400w.webp"));
    assert.ok(left.includes("body.webp") && left.includes("fresh.webp"));
    // 回收目录在上传目录里（同一个挂载卷），再跑一次清理也不会把它当成没用的文件
    const [trash] = await readdir(path.join(uploads, ".trash"));
    assert.deepEqual((await readdir(path.join(uploads, ".trash", trash))).sort(), ["orphan-400w.webp", "orphan.webp"]);
    assert.deepEqual(await findUnusedUploads({ uploadsDir: uploads, dbFile }), []);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
