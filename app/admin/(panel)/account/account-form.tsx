"use client";

import { useActionState } from "react";
import {
  updateAdminCredentials,
  type CredentialsFormState,
} from "@/lib/actions/account";

const inputClass =
  "h-11 w-full rounded-xl border border-line bg-paper px-4 text-sm outline-none transition-colors focus:border-accent focus:bg-white";

export default function AccountForm({ username }: { username: string }) {
  const [state, action, pending] = useActionState<
    CredentialsFormState,
    FormData
  >(updateAdminCredentials, {});

  return (
    <form action={action} className="space-y-5" autoComplete="off">
      <div>
        <label className="mb-1.5 block text-sm font-medium text-ink-2">
          管理员用户名
        </label>
        <input
          name="username"
          required
          minLength={3}
          maxLength={32}
          defaultValue={username}
          autoComplete="username"
          className={inputClass}
        />
        <p className="mt-1.5 text-xs text-ink-3">
          3-32 位字母、数字、下划线或连字符
        </p>
      </div>

      <div className="border-t border-line pt-5">
        <label className="mb-1.5 block text-sm font-medium text-ink-2">
          当前密码 <span className="font-normal text-ink-3">（必填，用于确认身份）</span>
        </label>
        <input
          name="currentPassword"
          type="password"
          required
          autoComplete="current-password"
          className={inputClass}
        />
      </div>

      <div>
        <label className="mb-1.5 block text-sm font-medium text-ink-2">
          新密码 <span className="font-normal text-ink-3">（不修改则留空）</span>
        </label>
        <input
          name="newPassword"
          type="password"
          minLength={8}
          autoComplete="new-password"
          className={inputClass}
          placeholder="至少 8 位"
        />
      </div>

      <div>
        <label className="mb-1.5 block text-sm font-medium text-ink-2">
          确认新密码
        </label>
        <input
          name="confirmPassword"
          type="password"
          minLength={8}
          autoComplete="new-password"
          className={inputClass}
        />
      </div>

      {state.error && (
        <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-600">
          {state.error}
        </p>
      )}
      {state.success && (
        <p className="rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-600">
          {state.success}
        </p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="h-11 rounded-xl bg-ink px-6 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
      >
        {pending ? "保存中…" : "保存账号设置"}
      </button>
    </form>
  );
}