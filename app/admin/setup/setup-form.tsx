"use client";

import { useActionState, useId, type InputHTMLAttributes, type ReactNode } from "react";
import { completeSetup, type SetupState } from "@/lib/actions/setup";
import { submitKeepingValues } from "@/lib/form-submit";

const inputClass =
  "mt-1.5 h-11 w-full rounded-xl border border-line bg-paper px-4 text-sm outline-none transition-colors focus:border-accent focus:bg-surface focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent/60";

/** 标签 + 输入框 + 说明（说明用 aria-describedby 关联，不放进标签里，读屏软件读到的字段名就是标签本身）。 */
function Field({ label, hint, className = "", ...input }: { label: string; hint?: ReactNode } & InputHTMLAttributes<HTMLInputElement>) {
  const id = useId();
  return (
    <div>
      <label htmlFor={id} className="block text-sm font-medium text-ink-2">
        {label}
      </label>
      <input id={id} aria-describedby={hint ? `${id}-hint` : undefined} className={`${inputClass} ${className}`} {...input} />
      {hint && (
        <p id={`${id}-hint`} className="mt-1.5 text-xs leading-relaxed text-ink-3">
          {hint}
        </p>
      )}
    </div>
  );
}

export default function SetupForm({ defaultSiteName }: { defaultSiteName: string }) {
  const [state, action, pending] = useActionState<SetupState, FormData>(completeSetup, {});
  return (
    // 不用 action={action}：校验失败时 React 会重置表单，已填的内容会丢
    <form onSubmit={submitKeepingValues(action)} className="mt-6 space-y-4">
      <Field
        label="安装码"
        name="code"
        required
        autoComplete="off"
        spellCheck={false}
        placeholder="XXXX-XXXX"
        className="font-mono uppercase tracking-widest"
        hint={
          <>
            在服务器的启动日志里（搜「安装码」）：Docker 用 <code>docker compose logs app</code>，PM2 用 <code>pm2 logs</code>。
            找不到时在服务器上运行 <code>npm run setup:code</code>（Docker：<code>docker compose exec -u node app npm run setup:code</code>）。
          </>
        }
      />
      <Field label="站点名称" name="siteName" required maxLength={30} defaultValue={defaultSiteName} />
      <Field
        label="站长用户名"
        name="username"
        required
        minLength={3}
        maxLength={32}
        defaultValue="admin"
        autoComplete="username"
        hint="登录用，3-32 位字母、数字、下划线或连字符；不会显示在前台。"
      />
      <Field
        label="密码"
        name="password"
        type="password"
        required
        minLength={10}
        autoComplete="new-password"
        hint="至少 10 位，不要用常见密码或包含用户名。"
      />
      <Field label="再输一次密码" name="confirm" type="password" required minLength={10} autoComplete="new-password" />
      <label className="flex items-start gap-2 text-sm text-ink-2">
        <input type="checkbox" name="keepSamples" defaultChecked className="mt-0.5 h-4 w-4 accent-[var(--color-accent)]" />
        <span>
          保留示例教程和分类
          <span className="block text-xs text-ink-3">先看看效果，以后可以在仪表盘一键清除；不勾选就从空白开始。</span>
        </span>
      </label>
      {state.error && (
        <p role="alert" className="rounded-xl bg-red-500/10 px-4 py-3 text-sm text-red-500">
          {state.error}
        </p>
      )}
      <button
        type="submit"
        disabled={pending}
        className="h-11 w-full rounded-full bg-btn text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
      >
        {pending ? "安装中…" : "完成安装并进入后台"}
      </button>
    </form>
  );
}
