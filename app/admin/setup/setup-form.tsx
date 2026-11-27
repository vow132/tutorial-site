"use client";

import { useActionState, useId, type InputHTMLAttributes, type ReactNode } from "react";
import { completeSetup, type SetupState } from "@/lib/actions/setup";
import { submitKeepingValues } from "@/lib/form-submit";
import LanguageSelect from "@/components/language-select";
import { useAdminI18n } from "@/lib/i18n/client";
import type { Locale } from "@/lib/i18n/locales";
import { rich } from "@/lib/i18n/rich";

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

export default function SetupForm({ defaultSiteName, locale }: { defaultSiteName: string; locale: Locale }) {
  const [state, action, pending] = useActionState<SetupState, FormData>(completeSetup, {});
  const { m } = useAdminI18n();
  const t = m.admin.setup;
  const siteName = defaultSiteName;
  return (
    // 不用 action={action}：校验失败时 React 会重置表单，已填的内容会丢
    <form onSubmit={submitKeepingValues(action)} className="mt-6 space-y-4">
      <div>
        <LanguageSelect value={locale} label={t.language} name="locale" className="text-sm" />
        <p className="mt-1.5 text-xs leading-relaxed text-ink-3">{t.languageHint}</p>
      </div>
      <Field
        label={t.code}
        name="code"
        required
        autoComplete="off"
        spellCheck={false}
        placeholder="XXXX-XXXX"
        className="font-mono uppercase tracking-widest"
        hint={
          <>
            {rich(t.codeHint, { docker: <code>docker compose logs app</code>, pm2: <code>pm2 logs</code> })}{" "}
            {rich(t.codeHintMissing, {
              npm: <code>npm run setup:code</code>,
              dockerExec: <code>docker compose exec -u node app npm run setup:code</code>,
            })}
          </>
        }
      />
      <Field key={siteName} label={t.siteName} name="siteName" required maxLength={30} defaultValue={siteName} />
      <Field
        label={t.username}
        name="username"
        required
        minLength={3}
        maxLength={32}
        defaultValue="admin"
        autoComplete="username"
        hint={t.usernameHint}
      />
      <Field
        label={t.password}
        name="password"
        type="password"
        required
        minLength={10}
        autoComplete="new-password"
        hint={t.passwordHint}
      />
      <Field label={t.confirm} name="confirm" type="password" required minLength={10} autoComplete="new-password" />
      <label className="flex items-start gap-2 text-sm text-ink-2">
        <input type="checkbox" name="keepSamples" defaultChecked className="mt-0.5 h-4 w-4 accent-[var(--color-accent)]" />
        <span>
          {t.keepSamples}
          <span className="block text-xs text-ink-3">{t.keepSamplesHint}</span>
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
        {pending ? t.submitting : t.submit}
      </button>
    </form>
  );
}
