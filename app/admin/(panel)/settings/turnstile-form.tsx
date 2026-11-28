"use client";

import { startTransition, useActionState, useRef, useState } from "react";
import TurnstileWidget from "@/components/turnstile-widget";
import { saveTurnstileSettings, type TurnstileFormState } from "@/lib/actions/turnstile";
import { isTurnstileKey } from "@/lib/turnstile";
import { useAdminI18n } from "@/lib/i18n/client";
import { rich } from "@/lib/i18n/rich";

const inputClass =
  "h-11 w-full rounded-xl border border-line bg-paper px-4 text-sm outline-none transition-colors focus:border-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent/60 focus:bg-surface";

export type TurnstileFormInitial = {
  enabled: boolean;
  siteKey: string;
  hasSecret: boolean;
  /** 存了 Secret Key 但解不开（换了 AUTH_SECRET / DATA_ENCRYPTION_KEY） */
  secretUnreadable: boolean;
};

/**
 * 「人机验证」设置（Cloudflare Turnstile）。开启时要先用填的 Site Key 在这里过一次验证，
 * 服务器再用 Secret Key 去 Cloudflare 核对，都成功才保存（lib/actions/turnstile.ts），免得填错把自己锁在外面。
 */
export default function TurnstileForm({ initial }: { initial: TurnstileFormInitial }) {
  const [state, action, pending] = useActionState<TurnstileFormState, FormData>(saveTurnstileSettings, {});
  const [enabled, setEnabled] = useState(initial.enabled);
  const [siteKey, setSiteKey] = useState(initial.siteKey);
  // 停止输入一会儿再用新的 Site Key 渲染小组件，不用每敲一个字就重新加载一次
  const [testKey, setTestKey] = useState(initial.siteKey);
  const typing = useRef(0);
  const [token, setToken] = useState<string | null>(null);
  const showWidget = enabled && isTurnstileKey(testKey);
  const { m } = useAdminI18n();
  const t = m.admin.settingsFields;

  return (
    <form
      className="space-y-4"
      // 手动提交：出错时不清空已填内容（React 19 默认会重置表单）
      onSubmit={(event) => {
        event.preventDefault();
        const formData = new FormData(event.currentTarget);
        startTransition(() => action(formData));
      }}
    >
      <p className="text-sm leading-relaxed text-ink-2">{t.turnstileIntro}</p>
      <ol className="list-decimal space-y-1 pl-5 text-xs leading-relaxed text-ink-3">
        <li>{t.turnstileStep1}</li>
        <li>{t.turnstileStep2}</li>
        <li>
          {rich(t.turnstileStep3, {
            reset: <code>npm run admin:reset</code>,
            docker: <code>docker compose exec -u node app npm run admin:reset</code>,
          })}
        </li>
      </ol>

      {initial.secretUnreadable && (
        <p className="rounded-xl bg-amber-500/10 px-4 py-3 text-sm text-amber-700 dark:text-amber-300">
          {t.turnstileUnreadable}
        </p>
      )}

      <label className="flex items-center gap-2 text-sm font-medium text-ink-2">
        <input
          type="checkbox"
          name="enabled"
          checked={enabled}
          onChange={(event) => setEnabled(event.target.checked)}
          className="h-4 w-4 accent-[var(--color-accent)]"
        />
        {t.turnstileEnable}
      </label>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="turnstile-site-key" className="mb-1.5 block text-sm font-medium text-ink-2">
            Site Key
          </label>
          <input
            id="turnstile-site-key"
            name="siteKey"
            value={siteKey}
            onChange={(event) => {
              const value = event.target.value.trim();
              setSiteKey(value);
              window.clearTimeout(typing.current);
              typing.current = window.setTimeout(() => {
                setTestKey(value);
                // 换了 Site Key，旧小组件拿到的令牌作废
                setToken(null);
              }, 600);
            }}
            placeholder="0x4AAAAAAA…"
            autoComplete="off"
            spellCheck={false}
            className={inputClass}
          />
        </div>
        <div>
          <label htmlFor="turnstile-secret" className="mb-1.5 block text-sm font-medium text-ink-2">
            Secret Key
          </label>
          <input
            id="turnstile-secret"
            name="secret"
            type="password"
            autoComplete="off"
            placeholder={initial.hasSecret && !initial.secretUnreadable ? t.keepSecret : "0x4AAAAAAA…"}
            className={inputClass}
          />
        </div>
      </div>

      {showWidget && (
        <div>
          <p className="mb-1.5 text-xs text-ink-3">{t.turnstileTry}</p>
          <TurnstileWidget key={testKey} siteKey={testKey} action="settings" resetKey={state} onToken={setToken} />
        </div>
      )}
      {token && <input type="hidden" name="turnstileToken" value={token} />}

      {state.error && <p className="rounded-xl bg-red-500/10 px-4 py-3 text-sm text-red-500 dark:text-red-400">{state.error}</p>}
      {state.success && (
        <p className="rounded-xl bg-emerald-500/10 px-4 py-3 text-sm text-emerald-600 dark:text-emerald-400">{state.success}</p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="h-11 rounded-xl bg-btn px-6 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
      >
        {pending ? m.admin.common.saving : t.turnstileSubmit}
      </button>
    </form>
  );
}
