"use client";

import { useActionState, useState } from "react";
import { useRouter } from "next/navigation";
import { useAdminI18n } from "@/lib/i18n/client";
import {
  disableTotp,
  enableTotp,
  regenerateRecoveryCodes,
  type CredentialsFormState,
  type TwoFactorFormState,
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

/**
 * 新恢复码只显示这一次。确认保存后才刷新页面（刷新会让这块内容消失）。
 */
function RecoveryCodesPanel({ codes, message }: { codes: string[]; message?: string }) {
  const router = useRouter();
  const [copied, setCopied] = useState(false);
  const t = useAdminI18n().m.admin.account;
  const text = codes.join("\n");
  const download = () => {
    const url = URL.createObjectURL(new Blob([`${t.recoveryFileTitle}\n\n${text}\n`], { type: "text/plain" }));
    const link = Object.assign(document.createElement("a"), { href: url, download: "recovery-codes.txt" });
    link.click();
    URL.revokeObjectURL(url);
  };
  return (
    <div className="space-y-4" role="region" aria-label={t.recoveryRegion}>
      {message && (
        <p className="rounded-xl bg-emerald-500/10 px-4 py-3 text-sm text-emerald-600 dark:text-emerald-400">{message}</p>
      )}
      <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 px-5 py-4 text-sm text-amber-800 dark:text-amber-200">
        <p className="font-semibold">{t.recoverySaveNow}</p>
        <p className="mt-1">{t.recoveryExplain}</p>
      </div>
      <ul className="grid grid-cols-2 gap-2 rounded-2xl border border-line bg-paper p-4 font-mono text-sm text-ink sm:grid-cols-2">
        {codes.map((code) => (
          <li key={code} className="select-all">{code}</li>
        ))}
      </ul>
      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          onClick={async () => {
            await navigator.clipboard?.writeText(text).catch(() => {});
            setCopied(true);
          }}
          className="h-10 rounded-xl border border-line px-4 text-sm font-medium text-ink transition-colors hover:bg-paper"
        >
          {copied ? t.copied : t.copyAll}
        </button>
        <button
          type="button"
          onClick={download}
          className="h-10 rounded-xl border border-line px-4 text-sm font-medium text-ink transition-colors hover:bg-paper"
        >
          {t.download}
        </button>
        <button
          type="button"
          onClick={() => router.refresh()}
          className="h-10 rounded-xl bg-btn px-5 text-sm font-semibold text-white transition-opacity hover:opacity-90"
        >
          {t.savedThem}
        </button>
      </div>
    </div>
  );
}

function ConfirmFields({ allowRecovery = false }: { allowRecovery?: boolean }) {
  const t = useAdminI18n().m.admin.account;
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <div>
        <label className="mb-1.5 block text-sm font-medium text-ink-2">{t.currentPassword}</label>
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
          {allowRecovery ? t.codeOrRecovery : t.code}
        </label>
        {allowRecovery ? (
          <input
            name="code"
            required
            maxLength={24}
            autoComplete="one-time-code"
            autoCapitalize="off"
            spellCheck={false}
            className={`${inputClass} tracking-[0.15em]`}
          />
        ) : (
          <input
            name="code"
            required
            inputMode="numeric"
            pattern="[0-9 ]{6,7}"
            maxLength={7}
            autoComplete="one-time-code"
            className={`${inputClass} tracking-[0.3em]`}
          />
        )}
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
  const [state, action, pending] = useActionState<TwoFactorFormState, FormData>(
    enableTotp,
    {}
  );
  const t = useAdminI18n().m.admin.account;

  if (state.recoveryCodes) return <RecoveryCodesPanel codes={state.recoveryCodes} message={state.success} />;

  return (
    <form action={action} className="space-y-5">
      <input type="hidden" name="setup" value={setup} />
      <div className="flex flex-col gap-5 sm:flex-row sm:items-center">
        {/* eslint-disable-next-line @next/next/no-img-element -- 服务端生成的 data URL 二维码 */}
        <img
          src={qrDataUrl}
          alt={t.qrAlt}
          width={176}
          height={176}
          className="h-44 w-44 shrink-0 rounded-2xl border border-line bg-white p-2 [image-rendering:pixelated]"
        />
        <div className="min-w-0 text-sm text-ink-2">
          <p>{t.scanStep}</p>
          <code className="mt-2 block break-all rounded-xl bg-paper px-3 py-2 font-mono text-xs text-ink">
            {secret.match(/.{1,4}/g)?.join(" ")}
          </code>
          <p className="mt-2">{t.confirmStep}</p>
        </div>
      </div>
      <ConfirmFields />
      <Feedback state={state} />
      <button
        type="submit"
        disabled={pending}
        className="h-11 rounded-xl bg-btn px-6 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
      >
        {pending ? t.verifying : t.enable}
      </button>
    </form>
  );
}

export function DisableTwoFactorForm() {
  const [state, action, pending] = useActionState<CredentialsFormState, FormData>(
    disableTotp,
    {}
  );
  const t = useAdminI18n().m.admin.account;

  return (
    <form action={action} className="space-y-5">
      <ConfirmFields allowRecovery />
      <Feedback state={state} />
      <button
        type="submit"
        disabled={pending}
        className="h-11 rounded-xl border border-red-500/40 px-6 text-sm font-semibold text-red-500 transition-colors hover:bg-red-500/10 disabled:opacity-50"
      >
        {pending ? t.verifying : t.disable}
      </button>
    </form>
  );
}

export function RegenerateRecoveryCodesForm() {
  const [state, action, pending] = useActionState<TwoFactorFormState, FormData>(
    regenerateRecoveryCodes,
    {}
  );
  const t = useAdminI18n().m.admin.account;

  if (state.recoveryCodes) return <RecoveryCodesPanel codes={state.recoveryCodes} message={state.success} />;

  return (
    <form action={action} className="space-y-5">
      <ConfirmFields allowRecovery />
      <Feedback state={state} />
      <button
        type="submit"
        disabled={pending}
        className="h-11 rounded-xl border border-line px-6 text-sm font-semibold text-ink transition-colors hover:bg-paper disabled:opacity-50"
      >
        {pending ? t.verifying : t.regenerateSubmit}
      </button>
    </form>
  );
}
