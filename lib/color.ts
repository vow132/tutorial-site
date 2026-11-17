import type { CSSProperties } from "react";

type RGB = [number, number, number];

function parseHex(hex: string): RGB | null {
  const match = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!match) return null;
  const value = parseInt(match[1], 16);
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
}

const toHex = (rgb: RGB) => `#${rgb.map((c) => Math.round(c).toString(16).padStart(2, "0")).join("")}`;

/** WCAG 2.x 相对亮度。 */
function luminance([r, g, b]: RGB) {
  const channel = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

export function contrastRatio(a: string, b: string) {
  const ca = parseHex(a);
  const cb = parseHex(b);
  if (!ca || !cb) return 1;
  const [hi, lo] = [luminance(ca), luminance(cb)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

const mix = (a: RGB, b: RGB, t: number): RGB => [0, 1, 2].map((i) => a[i] + (b[i] - a[i]) * t) as RGB;

/** 颜色以 alpha 叠在底色上（分类标签的 `${color}14` 浅色底）。 */
export function overlay(color: string, alpha: number, background: string) {
  const fg = parseHex(color);
  const bg = parseHex(background);
  return fg && bg ? toHex(mix(bg, fg, alpha)) : background;
}

/**
 * 把颜色朝黑（浅色主题）或朝白（深色主题）最少地推一点，直到在所有给定底色上
 * 对比度 ≥ minRatio（默认 4.6，留一点余量给 4.5 的 WCAG AA）。色相基本不变。
 */
export function readableOn(color: string, backgrounds: string[], toward: "#000000" | "#ffffff", minRatio = 4.6) {
  const base = parseHex(color);
  const target = parseHex(toward)!;
  if (!base) return toward;
  for (let step = 0; step <= 100; step += 2) {
    const candidate = toHex(mix(base, target, step / 100));
    if (backgrounds.every((bg) => contrastRatio(candidate, bg) >= minRatio)) return candidate;
  }
  return toward;
}

/** 浅色 / 深色主题下页面与卡片底色（与 app/globals.css 保持一致）。 */
const LIGHT_BACKGROUNDS = ["#ffffff", "#f7f8fa"];
const DARK_BACKGROUNDS = ["#161d27", "#0d1117", "#111821"];
/** 分类标签浅色底的 alpha（`${color}14` ≈ 8%）。 */
const TINT_ALPHA = 0x14 / 255;

/**
 * 分类颜色做小号文字时的样式：配合 globals.css 的 `.cat-text`，浅色/深色主题
 * 各取一个满足对比度的颜色；色块、圆点仍用原色。
 */
export function categoryTextStyle(color: string): CSSProperties {
  const light = readableOn(color, [...LIGHT_BACKGROUNDS, ...LIGHT_BACKGROUNDS.map((bg) => overlay(color, TINT_ALPHA, bg))], "#000000");
  const dark = readableOn(color, [...DARK_BACKGROUNDS, ...DARK_BACKGROUNDS.map((bg) => overlay(color, TINT_ALPHA, bg))], "#ffffff");
  return { "--cat-ink": light, "--cat-ink-dark": dark } as CSSProperties;
}
