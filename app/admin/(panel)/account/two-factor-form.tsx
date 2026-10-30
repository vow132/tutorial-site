"use client";

import { useActionState } from "react";
import {
  disableTotp,
  enableTotp,
  type CredentialsFormState,
} from "@/lib/actions/account";

const inputClass =
  "h-11 w-full rounded-xl border border-line bg-paper px-4 text-sm outline-none transition-colors focus:border-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent/60 focus:bg-surface";

function Feedback({ state }: { state: CredentialsFormState }) {
  if (state.error) {
    return (
      <p className="rounded-xl bg-red-500/10 px-4 py-3 text-sm text-red-500 dark:text-red-400">
        {state.error}
      </p>
    );
  }
  if (state.success) {
    return (
      <p className="rounded-xl bg-emerald-500/10 px-4 py-3 text-sm text-emerald-600 dark:text-emerald-400">
        {state.success}
      </p>
    );
  }
  return null;
}

function ConfirmFields() {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <div>
        <label className="mb-1.5 block text-sm font-medium text-ink-2">当前密码</label>
        <input
          name="currentPassword"
          type="password"
          required
          autoComplete="current-password"
          className={inputClass}
        />
      </div>
      <div>
        <label className="mb-1.5 block text-sm font-medium text-ink-2">6 位验证码</label>
        <input
          name="code"
          required
          inputMode="numeric"
          pattern="[0-9 ]{6,7}"
          maxLength={7}
          autoComplete="one-time-code"
          className={`${inputClass} tracking-[0.3em]`}
        />
      </div>
    </div>
  );
}

export function EnableTwoFactorForm({
  setup,
  secret,
  qrDataUrl,
}: {
  setup: string;
  secret: string;
  qrDataUrl: string;
}) {
  const [state, action, pending] = useActionState<CredentialsFormState, FormData>(
    enableTotp,
    {}
  );

  return (
    <form action={action} className="space-y-5">
      <input type="hidden" name="setup" value={setup} />
      <div className="flex flex-col gap-5 sm:flex-row sm:items-center">
        {/* eslint-disable-next-line @next/next/no-img-element -- 服务端生成的 data URL 二维码 */}
        <img
          src={qrDataUrl}
          alt="两步验证二维码"
          width={176}
          height={176}
          className="h-44 w-44 shrink-0 rounded-2xl border border-line bg-white p-2 [image-rendering:pixelated]"
        />
        <div className="min-w-0 text-sm text-ink-2">
          <p>
            1. 用 Google Authenticator、Microsoft Authenticator、1Password 等验证器 App 扫描二维码；
            无法扫码时手动输入密钥：
          </p>
          <code className="mt-2 block break-all rounded-xl bg-paper px-3 py-2 font-mono text-xs text-ink">
            {secret.match(/.{1,4}/g)?.join(" ")}
          </code>
          <p className="mt-2">2. 输入当前密码和 App 显示的 6 位数字完成绑定。</p>
        </div>
      </div>
      <ConfirmFields />
      <Feedback state={state} />
      <button
        type="submit"
        disabled={pending}
        className="h-11 rounded-xl bg-btn px-6 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
      >
        {pending ? "验证中…" : "开启两步验证"}
      </button>
    </form>
  );
}

export function DisableTwoFactorForm() {
  const [state, action, pending] = useActionState<CredentialsFormState, FormData>(
    disableTotp,
    {}
  );

  return (
    <form action={action} className="space-y-5">
      <ConfirmFields />
      <Feedback state={state} />
      <button
        type="submit"
        disabled={pending}
        className="h-11 rounded-xl border border-red-500/40 px-6 text-sm font-semibold text-red-500 transition-colors hover:bg-red-500/10 disabled:opacity-50"
      >
        {pending ? "验证中…" : "关闭两步验证"}
      </button>
    </form>
  );
}
