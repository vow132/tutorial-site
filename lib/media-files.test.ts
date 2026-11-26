import assert from "node:assert/strict";
import { mkdtemp, readdir, rm, utimes, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { formatBytes, listUploads, moveUploadsToTrash, pickCleanable, previewName } from "./media-files";

test("uploads are grouped by original, newest first, variants counted in; hidden folders skipped", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "media-files-"));
  try {
    const day = 24 * 60 * 60 * 1000;
    const files: [string, number, number][] = [
      ["a.webp", 1000, 10],
      ["a-400w.webp", 200, 10],
      ["a-800w.webp", 500, 10],
      ["b.png", 50, 1],
      ["orphan-400w.webp", 70, 20],
    ];
    for (const [name, size, ageDays] of files) {
      await writeFile(path.join(dir, name), Buffer.alloc(size));
      const when = new Date(Date.now() - ageDays * day);
      await utimes(path.join(dir, name), when, when);
    }
    await writeFile(path.join(dir, ".gitkeep"), "");
    const entries = await listUploads(dir);
    assert.deepEqual(entries.map((entry) => [entry.name, entry.bytes]), [["b.png", 50], ["a.webp", 1700], ["orphan-400w.webp", 70]]);
    assert.equal(previewName(entries[1]), "a-400w.webp");
    assert.equal(previewName(entries[0]), "b.png");

    // 只有没被引用、而且不是最近上传的可以批量清理
    assert.deepEqual(pickCleanable(entries, new Set(["b"])), ["a", "orphan"]);
    assert.deepEqual(pickCleanable(entries, new Set(["a", "orphan"])), [], "b.png is too recent");

    const moved = await moveUploadsToTrash(["a"], dir);
    assert.deepEqual(moved, { files: 3, bytes: 1700 });
    assert.deepEqual((await readdir(dir)).sort(), [".gitkeep", ".trash", "b.png", "orphan-400w.webp"]);
    const [stamp] = await readdir(path.join(dir, ".trash"));
    assert.deepEqual((await readdir(path.join(dir, ".trash", stamp))).sort(), ["a-400w.webp", "a-800w.webp", "a.webp"]);
    assert.deepEqual((await listUploads(dir)).map((entry) => entry.name), ["b.png", "orphan-400w.webp"], "the trash is not listed");
    assert.deepEqual(await moveUploadsToTrash(["missing"], dir), { files: 0, bytes: 0 });
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("sizes read naturally", () => {
  assert.equal(formatBytes(10), "1 KB");
  assert.equal(formatBytes(150 * 1024), "150 KB");
  assert.equal(formatBytes(3.25 * 1024 * 1024), "3.3 MB");
});
