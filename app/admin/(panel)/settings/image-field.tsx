"use client";

import { useId, useRef, useState } from "react";
import { useAdminI18n } from "@/lib/i18n/client";

/** 设置里的图片（收款码、赞助图）：上传到 /api/upload，地址放进隐藏字段随表单提交。 */
export default function ImageField({ name, label, hint, initial }: { name: string; label: string; hint?: string; initial: string }) {
  const [url, setUrl] = useState(initial);
  const { m, f } = useAdminI18n();
  const t = m.admin.settingsFields;
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const id = useId();

  const upload = async (file: File) => {
    setError(null);
    setUploading(true);
    try {
      const form = new FormData();
      form.append("file", file);
      const response = await fetch("/api/upload", { method: "POST", body: form });
      const data = (await response.json()) as { url?: string; error?: string };
      if (!response.ok || !data.url) throw new Error(data.error ?? t.uploadFailed);
      setUrl(data.url);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : t.uploadFailed);
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  return (
    <div>
      <span className="mb-1.5 block text-sm font-medium text-ink-2">
        {label}
        {hint && <span className="ml-2 text-xs font-normal text-ink-3">{hint}</span>}
      </span>
      <input type="hidden" name={name} value={url} />
      <div className="flex items-center gap-4 rounded-2xl border border-dashed border-line p-3">
        {url ? (
          // eslint-disable-next-line @next/next/no-img-element -- 上传的静态文件
          <img src={url} alt={f(t.imagePreview, { label })} className="h-20 w-20 rounded-lg border border-line bg-white object-contain" />
        ) : (
          <div className="flex h-20 w-20 items-center justify-center rounded-lg bg-paper text-xs text-ink-3">{t.imageEmpty}</div>
        )}
        <div className="flex flex-wrap items-center gap-2">
          <label className="inline-flex h-9 cursor-pointer items-center rounded-xl border border-line px-3 text-sm text-ink transition-colors hover:bg-paper has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-accent">
            {uploading ? t.uploading : url ? t.replace : t.upload}
            <input
              ref={fileRef}
              id={id}
              type="file"
              accept="image/png,image/jpeg,image/gif,image/webp"
              className="sr-only"
              disabled={uploading}
              aria-label={f(t.uploadLabel, { label })}
              onChange={(event) => {
                const file = event.currentTarget.files?.[0];
                if (file) void upload(file);
              }}
            />
          </label>
          {url && (
            <button type="button" onClick={() => setUrl("")} className="h-9 rounded-xl px-3 text-sm text-ink-3 transition-colors hover:text-red-500">
              {t.remove}
            </button>
          )}
          {error && <p className="w-full text-xs text-red-500 dark:text-red-400">{error}</p>}
        </div>
      </div>
    </div>
  );
}
