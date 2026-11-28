"use client";

import { useActionState, useState } from "react";
import { login, type LoginState } from "@/lib/actions/auth";
import TurnstileWidget from "@/components/turnstile-widget";
import { useAdminI18n } from "@/lib/i18n/client";

const inputClass =
  "h-11 w-full rounded-xl border border-line bg-paper px-4 text-sm outline-none transition-colors focus:border-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent/60 focus:bg-surface";

export default function LoginForm({
  from,
  initial,
  turnstileSiteKey,
}: {
  from?: string;
  initial?: { username: string; password: string };
  /** 开启了人机验证时的 Site Key（lib/turnstile-store.ts） */
  turnstileSiteKey?: string | null;
}) {
  const [state, action, pending] = useActionState<LoginState, FormData>(
    login,
    {}
  );
  // 人机验证的令牌只能用一次：每次服务器返回结果（密码错、要两步验证码……）都重新验证
  const [token, setToken] = useState<string | null>(null);
  const { m } = useAdminI18n();
  const t = m.admin.login;
  const [humanCheckFailed, setHumanCheckFailed] = useState(false);
  // 小组件加载失败（连不上 Cloudflare）时也允许提交，由服务器决定：命令行 admin:reset 关掉人机验证后就能登录
  const waitingForHuman = Boolean(turnstileSiteKey) && !token && !humanCheckFailed;
  // 受控输入：服务器要求两步验证码时，表单重置不会清空已填的账号密码。
  // initial：演示站预先填好公开的演示账号（lib/demo.ts）
  const [username, setUsername] = useState(initial?.username ?? "");
  const [password, setPassword] = useState(initial?.password ?? "");

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
      {token && <input type="hidden" name="turnstileToken" value={token} />}
      <div>
        <label htmlFor="login-username" className="mb-1.5 block text-sm font-medium text-ink-2">
          {t.username}
        </label>
        <input
          id="login-username"
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
        <label htmlFor="login-password" className="mb-1.5 block text-sm font-medium text-ink-2">
          {t.password}
        </label>
        <input
          id="login-password"
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
          <label htmlFor="login-totp" className="mb-1.5 block text-sm font-medium text-ink-2">
            {t.totp}
          </label>
          <input
            id="login-totp"
            name="totp"
            required
            autoFocus
            maxLength={24}
            autoComplete="one-time-code"
            autoCapitalize="off"
            spellCheck={false}
            aria-describedby="login-totp-hint"
            className={`${inputClass} tracking-[0.2em]`}
            placeholder={t.totpPlaceholder}
          />
          <p id="login-totp-hint" className="mt-1.5 text-xs text-ink-3">
            {t.totpHint}
          </p>
        </div>
      )}

      {turnstileSiteKey && (
        <TurnstileWidget
          siteKey={turnstileSiteKey}
          action="login"
          resetKey={state}
          onToken={(value) => {
            setToken(value);
            if (value) setHumanCheckFailed(false);
          }}
          onError={() => setHumanCheckFailed(true)}
        />
      )}

      {state.error && (
        <p className="rounded-xl bg-red-500/10 px-4 py-2.5 text-sm text-red-500 dark:text-red-400">
          {state.error}
        </p>
      )}

      <button
        type="submit"
        disabled={pending || waitingForHuman}
        className="h-11 w-full rounded-xl bg-btn text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
      >
        {pending ? t.submitting : waitingForHuman ? t.waitingForHuman : state.needsTotp ? t.verify : t.submit}
      </button>
    </form>
  );
}
