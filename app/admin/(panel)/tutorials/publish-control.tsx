"use client";

import { useState } from "react";
import { useAdminI18n } from "@/lib/i18n/client";

/** datetime-local 需要的本地时间格式：2026-11-20T09:30 */
function toLocalInput(date: Date) {
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/**
 * 发布方式：立即发布 / 存为草稿 / 定时发布。
 * 定时发布的时间按浏览器所在时区填写，提交前换算成 ISO 时间放进隐藏字段 publishAt，
 * 服务器时区设成什么都不影响。
 */
export default function PublishControl({ published, publishAt }: { published: boolean; publishAt: string | null }) {
  const t = useAdminI18n().m.admin.tutorials;
  const [mode, setMode] = useState<"now" | "draft" | "schedule">(publishAt ? "schedule" : published ? "now" : "draft");
  const [local, setLocal] = useState(() =>
    toLocalInput(publishAt ? new Date(publishAt) : new Date(Date.now() + 60 * 60 * 1000)),
  );
  const iso = (() => {
    const date = new Date(local);
    return Number.isNaN(date.getTime()) ? "" : date.toISOString();
  })();

  const option = (value: typeof mode, label: string) => (
    <label className="flex cursor-pointer items-center gap-2 text-sm font-medium text-ink-2">
      <input
        type="radio"
        name="publishMode"
        value={value}
        checked={mode === value}
        onChange={() => setMode(value)}
        className="h-4 w-4 accent-accent"
      />
      {label}
    </label>
  );

  return (
    <fieldset className="flex flex-wrap items-center gap-x-5 gap-y-2">
      <legend className="sr-only">{t.publishMode}</legend>
      {mode === "now" && <input type="hidden" name="published" value="on" />}
      {mode === "schedule" && <input type="hidden" name="publishAt" value={iso} />}
      {option("now", t.publishNow)}
      {option("draft", t.saveDraft)}
      {option("schedule", t.schedule)}
      {mode === "schedule" && (
        <input
          type="datetime-local"
          aria-label={t.publishTime}
          value={local}
          min={toLocalInput(new Date())}
          onChange={(event) => setLocal(event.target.value)}
          className="h-9 rounded-lg border border-line bg-surface px-2 text-sm text-ink outline-none focus:border-accent"
        />
      )}
    </fieldset>
  );
}
