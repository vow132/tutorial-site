import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { test } from "node:test";
import { fontCoverage } from "./font-coverage";

test("the bundled share-image font covers common Chinese, Latin and punctuation but not emoji", async () => {
  const data = await readFile(path.join(process.cwd(), "assets/fonts/NotoSansSC-Bold-subset.ttf"));
  const covered = fontCoverage(new Uint8Array(data));
  for (const char of "教程网的布局完全指南ABCxyz019，。：“”《》—…") {
    assert.ok(covered.has(char.codePointAt(0)!), `missing ${char}`);
  }
  for (const char of ["😀", "𠀀", "\u{E000}"]) assert.ok(!covered.has(char.codePointAt(0)!), `unexpected ${char}`);
  assert.ok(covered.size > 7000);
});
