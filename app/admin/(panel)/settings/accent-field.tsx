"use client";

import { useState } from "react";
import { contrastRatio } from "@/lib/color";
import { accentVariables } from "@/lib/brand";
import { DEFAULT_ACCENT } from "@/lib/settings-extras";
import { useAdminI18n } from "@/lib/i18n/client";

const PRESETS = ["#6366f1", "#0ea5e9", "#10b981", "#f59e0b", "#ef4444", "#ec4899", "#8b5cf6", "#17181c"];

/** 主题色：取色器 + 常用色；预览里的文字颜色就是前台实际会用的（已自动调到满足对比度）。 */
export default function AccentField({ initial, logoText }: { initial: string; logoText: string }) {
  const [color, setColor] = useState(initial || DEFAULT_ACCENT);
  const valid = /^#[0-9a-f]{6}$/i.test(color);
  const vars = valid ? accentVariables(color.toLowerCase()) : null;
  const { m, f } = useAdminI18n();
  const t = m.admin.settingsFields;

  return (
    <div>
      <span className="mb-1.5 block text-sm font-medium text-ink-2">
        {t.accent}
        <span className="ml-2 text-xs font-normal text-ink-3">{t.accentHint}</span>
      </span>
      <div className="flex flex-wrap items-center gap-3">
        <input
          type="color"
          value={valid ? color : DEFAULT_ACCENT}
          onChange={(event) => setColor(event.target.value)}
          aria-label={t.accentPick}
          className="h-10 w-14 cursor-pointer rounded-lg border border-line bg-surface p-1"
        />
        <input
          name="brand.accentColor"
          value={color}
          onChange={(event) => setColor(event.target.value.trim())}
          aria-label={t.accentValue}
          className="h-10 w-28 rounded-xl border border-line bg-surface px-3 font-mono text-sm outline-none focus:border-accent"
        />
        <div className="flex gap-1.5">
          {PRESETS.map((preset) => (
            <button
              key={preset}
              type="button"
              onClick={() => setColor(preset)}
              aria-label={f(t.accentPreset, { color: preset })}
              className={`h-7 w-7 rounded-full border ${color.toLowerCase() === preset ? "border-ink" : "border-line"}`}
              style={{ backgroundColor: preset }}
            />
          ))}
        </div>
      </div>
      {vars && (
        <div className="mt-3 flex flex-wrap items-center gap-4 rounded-xl border border-line bg-paper px-4 py-3 text-sm" aria-label={t.accentPreview}>
          <span className="flex h-7 w-7 items-center justify-center rounded-lg text-xs font-bold text-white" style={{ backgroundColor: vars.light.brand }}>
            {logoText}
          </span>
          <span style={{ color: vars.light.accentInk }}>{t.accentLink}</span>
          <span className="rounded-full px-2.5 py-0.5 text-xs" style={{ backgroundColor: vars.light.accentSoft, color: vars.light.accentInk }}>
            {t.accentSelected}
          </span>
          {contrastRatio(color, "#ffffff") < 3 && (
            <span className="text-xs text-ink-3">{t.accentLight}</span>
          )}
        </div>
      )}
    </div>
  );
}
