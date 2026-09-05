"use client";

import { useActionState } from "react";
import { login, type LoginState } from "@/lib/actions/auth";

export default function LoginForm({ from }: { from?: string }) {
  const [state, action, pending] = useActionState<LoginState, FormData>(
    login,
    {}
  );

  return (
    <form action={action} className="mt-6 space-y-4">
      {from && <input type="hidden" name="from" value={from} />}
      <div>
        <label className="mb-1.5 block text-sm font-medium text-ink-2">
          用户名
        </label>
        <input
          name="username"
          required
          autoComplete="username"
          className="h-11 w-full rounded-xl border border-line bg-paper px-4 text-sm outline-none transition-colors focus:border-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent/60 focus:bg-surface"
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
          className="h-11 w-full rounded-xl border border-line bg-paper px-4 text-sm outline-none transition-colors focus:border-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent/60 focus:bg-surface"
          placeholder="••••••••"
        />
      </div>

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
        {pending ? "登录中…" : "登 录"}
      </button>
    </form>
  );
}
