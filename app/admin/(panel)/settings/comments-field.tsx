"use client";

import { useState } from "react";
import { COMMENT_CDNS, COMMENT_PROVIDERS, type CommentProvider, type CommentsSettings } from "@/lib/comments";
import { useAdminI18n } from "@/lib/i18n/client";

const inputCls =
  "h-10 w-full rounded-xl border border-line bg-surface px-3.5 text-sm outline-none transition-colors focus:border-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent/60";

/** 站点设置里的「评论」：选服务，只显示这个服务要填的项。 */
export default function CommentsField({ initial }: { initial: CommentsSettings }) {
  const [value, setValue] = useState(initial);
  const t = useAdminI18n().m.admin.settingsFields;
  const set = (key: keyof CommentsSettings) => (event: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setValue((current) => ({ ...current, [key]: event.target.value }));
  const field = (key: keyof CommentsSettings, label: string, placeholder: string) => (
    <label className="block">
      <span className="mb-1.5 block text-sm font-medium text-ink-2">{label}</span>
      <input name={`comments.${key}`} value={value[key]} onChange={set(key)} placeholder={placeholder} className={inputCls} />
    </label>
  );
  const provider = value.provider;

  return (
    <div className="space-y-4">
      <label className="block">
        <span className="mb-1.5 block text-sm font-medium text-ink-2">{t.commentProvider}</span>
        <select name="comments.provider" value={provider} onChange={set("provider")} className={inputCls}>
          {(Object.keys(COMMENT_PROVIDERS) as CommentProvider[]).map((key) => (
            <option key={key} value={key}>
              {t.commentProviders[key]}
            </option>
          ))}
        </select>
      </label>

      {provider !== "none" && <p className="text-xs leading-relaxed text-ink-3">{t.commentHelp[provider]}</p>}

      {(provider === "waline" || provider === "twikoo" || provider === "artalk") &&
        field("server", t.commentServer, "https://comments.example.com")}
      {provider === "artalk" && field("site", t.commentSite, t.commentSitePlaceholder)}
      {(provider === "waline" || provider === "twikoo") && (
        <label className="block">
          <span className="mb-1.5 block text-sm font-medium text-ink-2">{t.commentCdn}</span>
          <select name="comments.cdn" value={value.cdn} onChange={set("cdn")} className={inputCls}>
            {(Object.keys(COMMENT_CDNS) as (keyof typeof COMMENT_CDNS)[]).map((key) => (
              <option key={key} value={key}>
                {t.commentCdns[key]}
              </option>
            ))}
          </select>
        </label>
      )}
      {provider === "giscus" && (
        <div className="grid gap-4 sm:grid-cols-2">
          {field("repo", t.giscusRepo, "octocat/blog-comments")}
          {field("repoId", t.giscusRepoId, "R_kgDO…")}
          {field("category", t.giscusCategory, "Announcements")}
          {field("categoryId", t.giscusCategoryId, "DIC_kwDO…")}
        </div>
      )}
    </div>
  );
}
