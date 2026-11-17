"use client";

import { useState, useTransition } from "react";
import { beginPasskeyLogin, finishPasskeyLogin } from "@/lib/actions/passkeys";

/** 浏览器拒绝或用户取消时的提示：不把浏览器原始报错直接抛给用户。 */
function describeWebAuthnError(error: unknown) {
  const name = error instanceof Error ? error.name : "";
  if (name === "NotAllowedError" || name === "AbortError") return "已取消或超时，请重试";
  if (name === "SecurityError") return "当前地址与站点设置的域名不一致，无法使用通行密钥";
  return "这个浏览器或设备无法使用通行密钥，请改用密码登录";
}

export default function PasskeyLogin({ from }: { from?: string }) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const login = () =>
    startTransition(async () => {
      setError(null);
      const begin = await beginPasskeyLogin();
      if (begin.error || !begin.options) {
        setError(begin.error ?? "无法开始验证，请刷新后重试");
        return;
      }
      // 只在点击时加载，登录页首屏不多带这段脚本。
      const { startAuthentication } = await import("@simplewebauthn/browser");
      let response;
      try {
        response = await startAuthentication({ optionsJSON: begin.options });
      } catch (cause) {
        setError(describeWebAuthnError(cause));
        return;
      }
      // 成功时服务端直接跳转到后台；只有失败才会返回结果。
      const result = await finishPasskeyLogin(response, from);
      if (result?.error) setError(result.error);
    });

  return (
    <div className="mt-5 space-y-3">
      <div className="flex items-center gap-3 text-xs text-ink-3">
        <span className="h-px flex-1 bg-line" />或<span className="h-px flex-1 bg-line" />
      </div>
      <button
        type="button"
        onClick={login}
        disabled={pending}
        className="flex h-11 w-full items-center justify-center gap-2 rounded-xl border border-line bg-surface text-sm font-semibold text-ink transition-colors hover:bg-paper disabled:opacity-50"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <circle cx="8" cy="8" r="4" />
          <path d="M10.8 10.8 20 20m-3-3 2-2m-4.5-.5 2-2" />
        </svg>
        {pending ? "等待验证…" : "使用通行密钥登录"}
      </button>
      {error && (
        <p className="rounded-xl bg-red-500/10 px-4 py-2.5 text-sm text-red-500 dark:text-red-400">{error}</p>
      )}
    </div>
  );
}
