import assert from "node:assert/strict";
import test from "node:test";
import { categoryTextStyle, contrastRatio, overlay, readableOn } from "./color";

test("contrast ratio matches WCAG reference values", () => {
  assert.equal(contrastRatio("#000000", "#ffffff").toFixed(1), "21.0");
  assert.equal(contrastRatio("#6366f1", "#ffffff").toFixed(2), "4.47");
  assert.equal(contrastRatio("#0ea5e9", "#ffffff").toFixed(2), "2.77");
});

test("category text colors pass AA on every page and tint background, in both themes", () => {
  const seeds = ["#6366f1", "#0ea5e9", "#10b981", "#f59e0b", "#ec4899"];
  const extremes = ["#ffff00", "#00ffff", "#ffffff", "#000000", "#123456"];
  for (const color of [...seeds, ...extremes]) {
    const style = categoryTextStyle(color) as Record<string, string>;
    for (const bg of ["#ffffff", "#f7f8fa", overlay(color, 0x14 / 255, "#f7f8fa")]) {
      assert.ok(contrastRatio(style["--cat-ink"], bg) >= 4.5, `${color} light on ${bg}`);
    }
    for (const bg of ["#161d27", "#0d1117", overlay(color, 0x14 / 255, "#161d27")]) {
      assert.ok(contrastRatio(style["--cat-ink-dark"], bg) >= 4.5, `${color} dark on ${bg}`);
    }
  }
});

test("colors that already pass are left untouched", () => {
  assert.equal(readableOn("#4f46e5", ["#ffffff"], "#000000"), "#4f46e5");
});
