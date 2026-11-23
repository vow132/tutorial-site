"use client";

import { useActionState } from "react";
import { saveMailSettings, sendTestMail, type MailFormState } from "@/lib/actions/subscribers";
import { submitKeepingValues } from "@/lib/form-submit";

const inputCls = "h-10 w-full rounded-xl border border-line bg-surface px-3 text-sm outline-none transition-colors focus:border-accent";

type Initial = { enabled: boolean; host: string; port: number; secure: boolean; user: string; hasPass: boolean; fromName: string; fromEmail: string };

function Result({ state }: { state: MailFormState }) {
  if (state.error) return <p className="text-sm text-red-500 dark:text-red-400">{state.error}</p>;
  if (state.success) return <p role="status" className="text-sm text-emerald-600 dark:text-emerald-400">{state.success}</p>;
  return null;
}

/** 发信配置。密码不回显：已保存时留空即不修改。 */
export function MailSettingsForm({ initial }: { initial: Initial }) {
  const [state, action, pending] = useActionState<MailFormState, FormData>(saveMailSettings, {});
  return (
    <form onSubmit={submitKeepingValues(action)} className="space-y-4">
      <label className="flex items-center gap-2 text-sm font-medium text-ink">
        <input type="checkbox" name="enabled" defaultChecked={initial.enabled} className="h-4 w-4 accent-[var(--color-accent)]" />
        开启邮件订阅（文章页和页脚显示订阅框，新教程发布时自动通知订阅者）
      </label>
      <div className="grid gap-4 sm:grid-cols-[1fr_120px]">
        <div>
          <label htmlFor="mail-host" className="mb-1.5 block text-sm text-ink-2">SMTP 服务器</label>
          <input id="mail-host" name="host" defaultValue={initial.host} placeholder="smtpdm.aliyun.com" className={inputCls} />
        </div>
        <div>
          <label htmlFor="mail-port" className="mb-1.5 block text-sm text-ink-2">端口</label>
          <input id="mail-port" name="port" inputMode="numeric" defaultValue={initial.port} className={inputCls} />
        </div>
      </div>
      <label className="flex items-center gap-2 text-sm text-ink-2">
        <input type="checkbox" name="secure" defaultChecked={initial.secure} className="h-4 w-4 accent-[var(--color-accent)]" />
        使用 SSL/TLS 连接（465 端口勾选；587/25 端口不勾，会自动升级加密）
      </label>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="mail-user" className="mb-1.5 block text-sm text-ink-2">用户名</label>
          <input id="mail-user" name="user" defaultValue={initial.user} autoComplete="off" className={inputCls} />
        </div>
        <div>
          <label htmlFor="mail-pass" className="mb-1.5 block text-sm text-ink-2">密码 / 授权码</label>
          <input
            id="mail-pass"
            name="pass"
            type="password"
            autoComplete="new-password"
            placeholder={initial.hasPass ? "已保存，留空表示不修改" : ""}
            className={inputCls}
          />
          {initial.hasPass && (
            <label className="mt-1.5 flex items-center gap-2 text-xs text-ink-3">
              <input type="checkbox" name="clearPass" className="h-3.5 w-3.5" />
              清除已保存的密码
            </label>
          )}
        </div>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="mail-from-name" className="mb-1.5 block text-sm text-ink-2">发件人名称</label>
          <input id="mail-from-name" name="fromName" defaultValue={initial.fromName} placeholder="留空用站点名称" className={inputCls} />
        </div>
        <div>
          <label htmlFor="mail-from" className="mb-1.5 block text-sm text-ink-2">发件人邮箱</label>
          <input id="mail-from" name="fromEmail" type="email" defaultValue={initial.fromEmail} placeholder="noreply@你的域名" className={inputCls} />
        </div>
      </div>
      <div className="flex items-center gap-3">
        <button type="submit" disabled={pending} className="h-10 rounded-full bg-btn px-5 text-sm font-semibold text-white disabled:opacity-50">
          {pending ? "保存中…" : "保存发信设置"}
        </button>
        <Result state={state} />
      </div>
    </form>
  );
}

export function TestMailForm() {
  const [state, action, pending] = useActionState<MailFormState, FormData>(sendTestMail, {});
  return (
    <form onSubmit={submitKeepingValues(action)} className="flex flex-wrap items-center gap-2">
      <label htmlFor="mail-test-to" className="sr-only">测试收件邮箱</label>
      <input id="mail-test-to" name="to" type="email" required placeholder="发一封测试邮件到…" className={`${inputCls} max-w-xs`} />
      <button type="submit" disabled={pending} className="h-10 rounded-full border border-line px-4 text-sm text-ink-2 transition-colors hover:bg-paper hover:text-ink disabled:opacity-50">
        {pending ? "发送中…" : "发送测试邮件"}
      </button>
      <div className="w-full">
        <Result state={state} />
      </div>
    </form>
  );
}
