"use client";

import { useRef, useState, useTransition } from "react";
import { beginPasskeyRegistration, finishPasskeyRegistration, removePasskey } from "@/lib/actions/passkeys";

const inputClass =
  "h-11 w-full rounded-xl border border-line bg-paper px-4 text-sm outline-none transition-colors focus:border-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent/60 focus:bg-surface";

export type PasskeyRow = {
  id: string;
  name: string;
  createdAt: string;
  lastUsedAt: string | null;
  backedUp: boolean;
};

function describeRegistrationError(error: unknown) {
  const name = error instanceof Error ? error.name : "";
  if (name === "InvalidStateError") return "这个设备已经登记过通行密钥了";
  if (name === "NotAllowedError" || name === "AbortError") return "已取消或超时，请重试";
  if (name === "SecurityError") return "当前地址与站点设置的域名（SITE_URL）不一致，无法登记通行密钥";
  return "这个浏览器或设备不支持通行密钥";
}

const dateFormat = new Intl.DateTimeFormat("zh-CN", { dateStyle: "medium", timeStyle: "short" });

export default function Passkeys({ passkeys, unavailable }: { passkeys: PasskeyRow[]; unavailable: string | null }) {
  const [message, setMessage] = useState<{ error?: string; success?: string }>({});
  const [pending, startTransition] = useTransition();
  const formRef = useRef<HTMLFormElement>(null);

  const add = (formData: FormData) =>
    startTransition(async () => {
      setMessage({});
      const begin = await beginPasskeyRegistration(
        String(formData.get("name") ?? ""),
        String(formData.get("currentPassword") ?? ""),
      );
      if (begin.error || !begin.options) {
        setMessage({ error: begin.error ?? "无法开始登记，请刷新后重试" });
        return;
      }
      const { startRegistration } = await import("@simplewebauthn/browser");
      let response;
      try {
        response = await startRegistration({ optionsJSON: begin.options });
      } catch (cause) {
        setMessage({ error: describeRegistrationError(cause) });
        return;
      }
      const result = await finishPasskeyRegistration(response);
      setMessage(result);
      if (result.success) formRef.current?.reset();
    });

  const remove = (row: PasskeyRow) => {
    if (!confirm(`确定删除通行密钥「${row.name}」吗？删除后这个设备不能再用它登录。`)) return;
    startTransition(async () => setMessage(await removePasskey(row.id)));
  };

  return (
    <div className="space-y-5">
      {passkeys.length > 0 && (
        <ul className="divide-y divide-line rounded-2xl border border-line">
          {passkeys.map((row) => (
            <li key={row.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm">
              <span className="font-medium text-ink">
                {row.name}
                {row.backedUp && (
                  <span className="ml-2 rounded-full bg-paper px-2 py-0.5 text-xs font-normal text-ink-3">已同步</span>
                )}
              </span>
              <span className="flex items-center gap-3 text-xs text-ink-3">
                <span>
                  添加于 {dateFormat.format(new Date(row.createdAt))}
                  {row.lastUsedAt ? ` · 上次使用 ${dateFormat.format(new Date(row.lastUsedAt))}` : " · 还没用过"}
                </span>
                <button
                  type="button"
                  onClick={() => remove(row)}
                  disabled={pending}
                  className="rounded-lg px-2 py-1 text-red-500 transition-colors hover:bg-red-500/10 disabled:opacity-50"
                >
                  删除
                </button>
              </span>
            </li>
          ))}
        </ul>
      )}

      {unavailable ? (
        <p className="rounded-xl bg-amber-500/10 px-4 py-3 text-sm text-amber-700 dark:text-amber-300">{unavailable}</p>
      ) : (
        <form
          ref={formRef}
          onSubmit={(event) => {
            event.preventDefault();
            add(new FormData(event.currentTarget));
          }}
          className="grid gap-4 sm:grid-cols-[1fr_1fr_auto] sm:items-end"
        >
          <div>
            <label htmlFor="passkey-name" className="mb-1.5 block text-sm font-medium text-ink-2">
              名称
            </label>
            <input id="passkey-name" name="name" maxLength={40} placeholder="如：MacBook 指纹" className={inputClass} />
          </div>
          <div>
            <label htmlFor="passkey-password" className="mb-1.5 block text-sm font-medium text-ink-2">
              当前密码
            </label>
            <input
              id="passkey-password"
              name="currentPassword"
              type="password"
              autoComplete="current-password"
              className={inputClass}
            />
          </div>
          <button
            type="submit"
            disabled={pending}
            className="h-11 rounded-xl bg-btn px-5 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {pending ? "处理中…" : "添加通行密钥"}
          </button>
        </form>
      )}

      {message.error && (
        <p className="rounded-xl bg-red-500/10 px-4 py-3 text-sm text-red-500 dark:text-red-400">{message.error}</p>
      )}
      {message.success && (
        <p className="rounded-xl bg-emerald-500/10 px-4 py-3 text-sm text-emerald-600 dark:text-emerald-400">
          {message.success}
        </p>
      )}
    </div>
  );
}
