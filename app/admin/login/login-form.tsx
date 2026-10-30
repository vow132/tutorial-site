"use client";

import { useActionState, useState } from "react";
import { login, type LoginState } from "@/lib/actions/auth";

const inputClass =
  "h-11 w-full rounded-xl border border-line bg-paper px-4 text-sm outline-none transition-colors focus:border-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent/60 focus:bg-surface";

export default function LoginForm({ from }: { from?: string }) {
  const [state, action, pending] = useActionState<LoginState, FormData>(
    login,
    {}
  );
  // 受控输入：服务器要求两步验证码时，表单重置不会清空已填的账号密码。
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");

  return (
    <form
      action={action}
      // 浏览器自动填充有时不触发 onChange；提交时以输入框实际值为准，
      // 否则需要两步验证时，表单重新渲染会把自动填充的密码清空。
      onSubmit={(event) => {
        const form = event.currentTarget;
        setUsername((form.elements.namedItem("username") as HTMLInputElement).value);
        setPassword((form.elements.namedItem("password") as HTMLInputElement).value);
      }}
      className="mt-6 space-y-4"
    >
      {from && <input type="hidden" name="from" value={from} />}
      <div>
        <label className="mb-1.5 block text-sm font-medium text-ink-2">
          用户名
        </label>
        <input
          name="username"
          required
          autoComplete="username"
          value={username}
          onChange={(event) => setUsername(event.target.value)}
          className={inputClass}
          placeholder="admin"
        />
      </div>
      <div>
        <label className="mb-1.5 block text-sm font-medium text-ink-2">
          密码
        </label>
        <input
          name="password"
          type="password"
          required
          autoComplete="current-password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          className={inputClass}
          placeholder="••••••••"
        />
      </div>
      {state.needsTotp && (
        <div>
          <label className="mb-1.5 block text-sm font-medium text-ink-2">
            两步验证码
          </label>
          <input
            name="totp"
            required
            autoFocus
            inputMode="numeric"
            pattern="[0-9 ]{6,7}"
            maxLength={7}
            autoComplete="one-time-code"
            className={`${inputClass} tracking-[0.3em]`}
            placeholder="验证器中的 6 位数字"
          />
        </div>
      )}

      {state.error && (
        <p className="rounded-xl bg-red-500/10 px-4 py-2.5 text-sm text-red-500 dark:text-red-400">
          {state.error}
        </p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="h-11 w-full rounded-xl bg-btn text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
      >
        {pending ? "登录中…" : state.needsTotp ? "验 证" : "登 录"}
      </button>
    </form>
  );
}
