"use client";

import { useState } from "react";
import { contrastRatio } from "@/lib/color";
import { accentVariables } from "@/lib/brand";
import { DEFAULT_ACCENT } from "@/lib/settings-extras";

const PRESETS = ["#6366f1", "#0ea5e9", "#10b981", "#f59e0b", "#ef4444", "#ec4899", "#8b5cf6", "#17181c"];

/** 主题色：取色器 + 常用色；预览里的文字颜色就是前台实际会用的（已自动调到满足对比度）。 */
export default function AccentField({ initial, logoText }: { initial: string; logoText: string }) {
  const [color, setColor] = useState(initial || DEFAULT_ACCENT);
  const valid = /^#[0-9a-f]{6}$/i.test(color);
  const vars = valid ? accentVariables(color.toLowerCase()) : null;

  return (
    <div>
      <span className="mb-1.5 block text-sm font-medium text-ink-2">
        主题色
        <span className="ml-2 text-xs font-normal text-ink-3">链接、按钮高亮、Logo 底色；文字会自动加深或提亮到看得清</span>
      </span>
      <div className="flex flex-wrap items-center gap-3">
        <input
          type="color"
          value={valid ? color : DEFAULT_ACCENT}
          onChange={(event) => setColor(event.target.value)}
          aria-label="选择主题色"
          className="h-10 w-14 cursor-pointer rounded-lg border border-line bg-surface p-1"
        />
        <input
          name="brand.accentColor"
          value={color}
          onChange={(event) => setColor(event.target.value.trim())}
          aria-label="主题色色值"
          className="h-10 w-28 rounded-xl border border-line bg-surface px-3 font-mono text-sm outline-none focus:border-accent"
        />
        <div className="flex gap-1.5">
          {PRESETS.map((preset) => (
            <button
              key={preset}
              type="button"
              onClick={() => setColor(preset)}
              aria-label={`使用 ${preset}`}
              className={`h-7 w-7 rounded-full border ${color.toLowerCase() === preset ? "border-ink" : "border-line"}`}
              style={{ backgroundColor: preset }}
            />
          ))}
        </div>
      </div>
      {vars && (
        <div className="mt-3 flex flex-wrap items-center gap-4 rounded-xl border border-line bg-paper px-4 py-3 text-sm" aria-label="主题色预览">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg text-xs font-bold text-white" style={{ backgroundColor: vars.light.brand }}>
            {logoText}
          </span>
          <span style={{ color: vars.light.accentInk }}>链接文字示例</span>
          <span className="rounded-full px-2.5 py-0.5 text-xs" style={{ backgroundColor: vars.light.accentSoft, color: vars.light.accentInk }}>
            选中项
          </span>
          {contrastRatio(color, "#ffffff") < 3 && (
            <span className="text-xs text-ink-3">颜色较浅：小字会自动用加深的版本</span>
          )}
        </div>
      )}
    </div>
  );
}
