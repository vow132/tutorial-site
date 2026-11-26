"use client";

import { useState } from "react";
import { COMMENT_CDNS, COMMENT_PROVIDERS, type CommentProvider, type CommentsSettings } from "@/lib/comments";

const inputCls =
  "h-10 w-full rounded-xl border border-line bg-surface px-3.5 text-sm outline-none transition-colors focus:border-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent/60";

const HELP: Record<Exclude<CommentProvider, "none">, string> = {
  waline: "自己部署 Waline 服务端（Vercel、Docker 等，见 waline.js.org），填它的地址；评论审核、反垃圾在 Waline 后台设置。",
  twikoo: "自己部署 Twikoo（Vercel、Docker 等，见 twikoo.js.org），填它的地址（以 https:// 开头）；腾讯云开发的环境 ID 不支持。",
  artalk: "自己部署 Artalk（Docker，见 artalk.js.org），填它的地址和后台里建的站点名；前端脚本由 Artalk 服务端提供。",
  giscus: "评论存在 GitHub 仓库的 Discussions 里，读者要用 GitHub 账号登录（国内访问可能较慢）。在 giscus.app 选好仓库和分类后，把生成代码里的四个值填进来。",
};

/** 站点设置里的「评论」：选服务，只显示这个服务要填的项。 */
export default function CommentsField({ initial }: { initial: CommentsSettings }) {
  const [value, setValue] = useState(initial);
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
        <span className="mb-1.5 block text-sm font-medium text-ink-2">评论服务</span>
        <select name="comments.provider" value={provider} onChange={set("provider")} className={inputCls}>
          {(Object.keys(COMMENT_PROVIDERS) as CommentProvider[]).map((key) => (
            <option key={key} value={key}>
              {COMMENT_PROVIDERS[key].label}
            </option>
          ))}
        </select>
      </label>

      {provider !== "none" && <p className="text-xs leading-relaxed text-ink-3">{HELP[provider]}</p>}

      {(provider === "waline" || provider === "twikoo" || provider === "artalk") &&
        field("server", "服务端地址", "https://comments.example.com")}
      {provider === "artalk" && field("site", "站点名", "我的教程网")}
      {(provider === "waline" || provider === "twikoo") && (
        <label className="block">
          <span className="mb-1.5 block text-sm font-medium text-ink-2">前端脚本从哪里加载</span>
          <select name="comments.cdn" value={value.cdn} onChange={set("cdn")} className={inputCls}>
            {(Object.keys(COMMENT_CDNS) as (keyof typeof COMMENT_CDNS)[]).map((key) => (
              <option key={key} value={key}>
                {COMMENT_CDNS[key].label}
              </option>
            ))}
          </select>
        </label>
      )}
      {provider === "giscus" && (
        <div className="grid gap-4 sm:grid-cols-2">
          {field("repo", "仓库（data-repo）", "octocat/blog-comments")}
          {field("repoId", "仓库 ID（data-repo-id）", "R_kgDO…")}
          {field("category", "分类（data-category）", "Announcements")}
          {field("categoryId", "分类 ID（data-category-id）", "DIC_kwDO…")}
        </div>
      )}
    </div>
  );
}
