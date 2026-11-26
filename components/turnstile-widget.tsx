"use client";

import { useEffect, useRef, useState } from "react";
import { TURNSTILE_SCRIPT_URL, type TurnstileAction } from "@/lib/turnstile";

type RenderOptions = {
  sitekey: string;
  action: string;
  theme: "light" | "dark";
  language: string;
  size: "flexible" | "compact";
  "response-field": boolean;
  callback: (token: string) => void;
  "expired-callback": () => void;
  "error-callback": () => boolean;
};

type TurnstileApi = {
  render: (container: HTMLElement, options: RenderOptions) => string | undefined;
  reset: (widgetId: string) => void;
  remove: (widgetId: string) => void;
};

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

let scriptPromise: Promise<TurnstileApi> | null = null;

/**
 * Cloudflare 的脚本只在第一次需要时加载一次。后台是 nonce + 'strict-dynamic' 的 CSP：
 * 由已受信任的脚本插入的 <script> 可以执行；前台 CSP 单独放行了 challenges.cloudflare.com（lib/csp.mjs）。
 */
function loadTurnstile(): Promise<TurnstileApi> {
  if (window.turnstile) return Promise.resolve(window.turnstile);
  scriptPromise ??= new Promise<TurnstileApi>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = TURNSTILE_SCRIPT_URL;
    script.async = true;
    script.onload = () => (window.turnstile ? resolve(window.turnstile) : reject(new Error("turnstile missing")));
    script.onerror = () => {
      scriptPromise = null;
      script.remove();
      reject(new Error("turnstile script failed"));
    };
    document.head.append(script);
  });
  return scriptPromise;
}

/**
 * 人机验证小组件（Cloudflare Turnstile）。拿到令牌时调用 onToken(token)，过期或重置时 onToken(null)，
 * 加载失败（比如连不上 Cloudflare）时 onError()。令牌只能用一次：每提交一次，调用方换一个 resetKey
 * （比如服务器返回的结果对象），组件重新验证一遍（通常不用读者再点）。令牌由调用方放进请求里，不用组件自动插入的隐藏字段。
 */
export default function TurnstileWidget({
  siteKey,
  action,
  onToken,
  onError,
  resetKey,
  className = "",
}: {
  siteKey: string;
  action: TurnstileAction;
  onToken: (token: string | null) => void;
  onError?: () => void;
  resetKey?: unknown;
  className?: string;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const widgetRef = useRef<string | null>(null);
  const callbacks = useRef({ onToken, onError });
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    callbacks.current = { onToken, onError };
  });

  useEffect(() => {
    let cancelled = false;
    loadTurnstile()
      .then((api) => {
        const container = containerRef.current;
        if (cancelled || !container) return;
        widgetRef.current =
          api.render(container, {
            sitekey: siteKey,
            action,
            theme: document.documentElement.dataset.theme === "dark" ? "dark" : "light",
            language: "zh-cn",
            // flexible 最窄 300px：手机上的登录卡片等放不下时用 compact（150×140）
            size: container.clientWidth >= 300 ? "flexible" : "compact",
            "response-field": false,
            callback: (token) => callbacks.current.onToken(token),
            "expired-callback": () => callbacks.current.onToken(null),
            "error-callback": () => {
              callbacks.current.onToken(null);
              callbacks.current.onError?.();
              return false;
            },
          }) ?? null;
      })
      .catch(() => {
        if (cancelled) return;
        setFailed(true);
        callbacks.current.onError?.();
      });
    return () => {
      cancelled = true;
      if (widgetRef.current && window.turnstile) window.turnstile.remove(widgetRef.current);
      widgetRef.current = null;
    };
  }, [siteKey, action]);

  const lastResetKey = useRef(resetKey);
  useEffect(() => {
    if (Object.is(lastResetKey.current, resetKey)) return;
    lastResetKey.current = resetKey;
    if (!widgetRef.current || !window.turnstile) return;
    callbacks.current.onToken(null);
    window.turnstile.reset(widgetRef.current);
  }, [resetKey]);

  return (
    <div className={className}>
      <div ref={containerRef} className="turnstile-box min-h-[65px]" data-turnstile-action={action} />
      {failed && (
        <p role="alert" className="mt-1.5 text-xs text-red-500 dark:text-red-400">
          人机验证加载失败（可能连不上 Cloudflare），请刷新页面再试。
        </p>
      )}
    </div>
  );
}
