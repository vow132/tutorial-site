"use client";

import { useRef, useState } from "react";
import { useAdminI18n } from "@/lib/i18n/client";

/**
 * 封面图：上传后把地址放进隐藏字段 cover，随表单提交。
 * 不设封面时，列表卡片自动用正文第一张图片做缩略图，文章页不显示头图。
 */
export default function CoverField({ initial }: { initial: string | null }) {
  const t = useAdminI18n().m.admin.tutorials;
  const [cover, setCover] = useState(initial ?? "");
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const upload = async (file: File) => {
    setError(null);
    setUploading(true);
    try {
      const form = new FormData();
      form.append("file", file);
      const response = await fetch("/api/upload", { method: "POST", body: form });
      const data = (await response.json()) as { url?: string; error?: string };
      if (!response.ok || !data.url) throw new Error(data.error ?? t.uploadFailed);
      setCover(data.url);
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
        {t.cover}
        <span className="ml-2 text-xs font-normal text-ink-3">
          {t.coverHint}
        </span>
      </span>
      <input type="hidden" name="cover" value={cover} />
      <div className="flex flex-col gap-4 rounded-2xl border border-dashed border-line bg-surface p-4 sm:flex-row sm:items-center">
        {cover ? (
          // eslint-disable-next-line @next/next/no-img-element -- 上传的静态文件
          <img
            src={cover}
            alt={t.coverAlt}
            className="aspect-video w-full max-w-xs rounded-xl border border-line object-cover"
          />
        ) : (
          <div className="flex aspect-video w-full max-w-xs items-center justify-center rounded-xl bg-paper text-xs text-ink-3">
            {t.noCover}
          </div>
        )}
        <div className="flex flex-wrap items-center gap-3">
          <label className="inline-flex h-10 cursor-pointer items-center rounded-xl border border-line px-4 text-sm font-medium text-ink transition-colors hover:bg-paper has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-accent">
            {uploading ? t.uploading : cover ? t.changeCover : t.uploadCover}
            <input
              ref={fileRef}
              type="file"
              accept="image/png,image/jpeg,image/gif,image/webp"
              className="sr-only"
              disabled={uploading}
              aria-label={t.chooseCover}
              onChange={(event) => {
                const file = event.currentTarget.files?.[0];
                if (file) void upload(file);
              }}
            />
          </label>
          {cover && (
            <button
              type="button"
              onClick={() => setCover("")}
              className="h-10 rounded-xl px-4 text-sm font-medium text-ink-3 transition-colors hover:text-red-500"
            >
              {t.removeCover}
            </button>
          )}
          {error && <p className="w-full text-sm text-red-500 dark:text-red-400">{error}</p>}
        </div>
      </div>
    </div>
  );
}
