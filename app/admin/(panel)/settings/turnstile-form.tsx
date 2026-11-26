"use client";

import { startTransition, useActionState, useRef, useState } from "react";
import TurnstileWidget from "@/components/turnstile-widget";
import { saveTurnstileSettings, type TurnstileFormState } from "@/lib/actions/turnstile";
import { isTurnstileKey } from "@/lib/turnstile";

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
      <p className="text-sm leading-relaxed text-ink-2">
        开启后，后台密码登录、邮件订阅和读者留言提交前都要先过 Cloudflare 的人机验证（大多数人不用点，自动通过），
        拦住批量猜密码、刷订阅邮件和刷留言的脚本。通行密钥登录不需要。读者打开订阅框或留言框时才加载 Cloudflare 的脚本，
        平时浏览文章不受影响。
      </p>
      <ol className="list-decimal space-y-1 pl-5 text-xs leading-relaxed text-ink-3">
        <li>
          登录 Cloudflare 控制台 → Turnstile → 添加小组件：域名填本站的域名，模式选「托管」（Managed）。不需要把网站接入 Cloudflare 的 CDN。
        </li>
        <li>把 Site Key 和 Secret Key 填到下面，勾选「开启」，等下方的验证通过后保存。</li>
        <li>
          国内访问 challenges.cloudflare.com 大多正常，偶尔会慢。万一开启后登录不了，在服务器上运行 <code>npm run admin:reset</code>（Docker：
          <code>docker compose exec -u node app npm run admin:reset</code>）会同时关闭人机验证。
        </li>
      </ol>

      {initial.secretUnreadable && (
        <p className="rounded-xl bg-amber-500/10 px-4 py-3 text-sm text-amber-700 dark:text-amber-300">
          已保存的 Secret Key 解不开（可能换了 AUTH_SECRET 或 DATA_ENCRYPTION_KEY），人机验证暂时按关闭处理，请重新填写 Secret Key。
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
        开启人机验证
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
            placeholder={initial.hasSecret && !initial.secretUnreadable ? "已设置，留空则不修改" : "0x4AAAAAAA…"}
            className={inputClass}
          />
        </div>
      </div>

      {showWidget && (
        <div>
          <p className="mb-1.5 text-xs text-ink-3">用上面的 Site Key 试一下（保存时服务器会用 Secret Key 核对这一次的结果）：</p>
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
        {pending ? "保存中…" : "保存人机验证设置"}
      </button>
    </form>
  );
}
