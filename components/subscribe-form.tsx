"use client";

import { useId, useState, type FormEvent } from "react";
import TurnstileWidget from "@/components/turnstile-widget";
import { useI18n } from "@/lib/i18n/client";

/**
 * 订阅新教程提醒：提交邮箱后发确认邮件，点了邮件里的链接才算订阅。
 * 隐藏的「网址」字段用来拦机器人（真人看不到也不会填）。
 * 后台开启了人机验证时（turnstileSiteKey），读者点进邮箱框才加载 Cloudflare 的小组件，平时不加载第三方脚本。
 */
export default function SubscribeForm({ className = "", turnstileSiteKey = null }: { className?: string; turnstileSiteKey?: string | null }) {
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [message, setMessage] = useState("");
  const [showCheck, setShowCheck] = useState(false);
  const [token, setToken] = useState<string | null>(null);
  const [checkFailed, setCheckFailed] = useState(false);
  const [resetKey, setResetKey] = useState(0);
  const id = useId();
  const { m, f } = useI18n();
  const t = m.reader.subscribe;

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const email = String(data.get("email") ?? "").trim();
    if (turnstileSiteKey && !token && !checkFailed) {
      setShowCheck(true);
      setStatus("error");
      setMessage(t.waiting);
      return;
    }
    setStatus("sending");
    try {
      const response = await fetch("/api/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, website: data.get("website"), turnstileToken: token }),
      });
      if (response.ok) {
        setStatus("sent");
        setMessage(f(t.sent, { email }));
        return;
      }
      const body = (await response.json().catch(() => ({}))) as { error?: string };
      setStatus("error");
      setMessage(body.error ?? t.failed);
    } catch {
      setStatus("error");
      setMessage(t.network);
    }
    // 令牌只能用一次，没订阅成功就重新验证
    if (turnstileSiteKey) setResetKey((value) => value + 1);
  };

  return (
    <div className={className}>
      {status === "sent" ? (
        <p role="status" className="text-sm text-emerald-600 dark:text-emerald-400">
          {message}
        </p>
      ) : (
        <form onSubmit={submit}>
          <div className="flex flex-col gap-2 sm:flex-row">
            <label htmlFor={`${id}-email`} className="sr-only">
              {t.emailLabel}
            </label>
            <input
              id={`${id}-email`}
              name="email"
              type="email"
              required
              maxLength={254}
              autoComplete="email"
              placeholder={t.emailPlaceholder}
              onFocus={() => setShowCheck(true)}
              className="h-10 min-w-0 flex-1 rounded-full border border-line bg-paper px-4 text-sm text-ink outline-none transition-colors placeholder:text-ink-3 focus:border-accent"
            />
            {/* 拦机器人的隐藏字段：移出屏幕、读屏和 Tab 都跳过 */}
            <input name="website" tabIndex={-1} autoComplete="off" aria-hidden="true" className="absolute -left-[9999px] h-px w-px opacity-0" />
            <button
              type="submit"
              disabled={status === "sending"}
              className="h-10 shrink-0 rounded-full bg-btn px-5 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
            >
              {status === "sending" ? t.submitting : t.submit}
            </button>
          </div>
          {turnstileSiteKey && showCheck && (
            <TurnstileWidget
              className="mt-3"
              siteKey={turnstileSiteKey}
              action="subscribe"
              resetKey={resetKey}
              onToken={(value) => {
                setToken(value);
                if (value) setCheckFailed(false);
              }}
              onError={() => setCheckFailed(true)}
            />
          )}
        </form>
      )}
      {status === "error" && (
        <p role="alert" className="mt-2 text-xs text-red-500 dark:text-red-400">
          {message}
        </p>
      )}
    </div>
  );
}
