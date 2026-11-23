import { contrastRatio, overlay, readableOn } from "@/lib/color";
import { DEFAULT_ACCENT } from "@/lib/settings-extras";

/**
 * 主题色 → 一组 CSS 变量（浅色 / 深色主题各一份），覆盖 app/globals.css 里的默认靛蓝。
 * 站长随便选什么颜色，文字类的变体都会自动推到满足 WCAG AA 对比度：
 * - accent：图标、大字、色块（浅色主题用原色，深色主题提亮到在深底上清晰）
 * - accent-ink：小号强调文字（链接、选中项），对比度 ≥ 4.6
 * - accent-soft：浅色底（选中项背景、标签底）
 * - brand：Logo 方块底色，上面的白字对比度 ≥ 4.5
 */

const LIGHT = ["#ffffff", "#f7f8fa"];
const DARK = ["#161d27", "#0d1117", "#111821"];

export type AccentVariables = Record<"accent" | "accentInk" | "accentSoft" | "brand" | "chart", string>;

export function accentVariables(hex: string): { light: AccentVariables; dark: AccentVariables } {
  const brand = readableOn(hex, ["#ffffff"], "#000000", 4.5);
  const lightInk = readableOn(hex, LIGHT, "#000000");
  const darkAccent = readableOn(hex, DARK, "#ffffff", 3);
  const darkInk = readableOn(hex, DARK, "#ffffff");
  return {
    light: {
      accent: hex,
      accentInk: lightInk,
      accentSoft: overlay(hex, 0.1, "#ffffff"),
      brand,
      // 折线图：原色在卡片底上 ≥ 3:1 就用原色，太浅时用加深的版本
      chart: contrastRatio(hex, "#ffffff") >= 3 ? hex : readableOn(hex, ["#ffffff"], "#000000", 3),
    },
    dark: {
      accent: darkAccent,
      accentInk: darkInk,
      accentSoft: overlay(hex, 0.22, "#161d27"),
      brand,
      chart: darkAccent,
    },
  };
}

const declarations = (vars: AccentVariables) =>
  [
    `--color-accent:${vars.accent}`,
    `--color-accent-ink:${vars.accentInk}`,
    `--color-accent-soft:${vars.accentSoft}`,
    `--color-brand:${vars.brand}`,
    `--chart-trend:${vars.chart}`,
  ].join(";");

/**
 * 根布局里内联的覆盖样式。选择器比 globals.css 多一个 html，所以不管样式表的先后顺序都能盖过默认值。
 * 没设置主题色（或就是默认色）时返回空串，不输出任何样式。
 */
export function brandCss(accentColor: string) {
  if (!/^#[0-9a-f]{6}$/i.test(accentColor) || accentColor.toLowerCase() === DEFAULT_ACCENT) return "";
  const { light, dark } = accentVariables(accentColor.toLowerCase());
  return `html:root{${declarations(light)}}html:root[data-theme="dark"]{${declarations(dark)}}`;
}
