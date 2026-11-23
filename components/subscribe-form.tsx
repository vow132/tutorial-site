"use client";

import { useId, useState, type FormEvent } from "react";

/**
 * 订阅新教程提醒：提交邮箱后发确认邮件，点了邮件里的链接才算订阅。
 * 隐藏的「网址」字段用来拦机器人（真人看不到也不会填）。
 */
export default function SubscribeForm({ className = "" }: { className?: string }) {
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [message, setMessage] = useState("");
  const id = useId();

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const email = String(data.get("email") ?? "").trim();
    setStatus("sending");
    try {
      const response = await fetch("/api/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, website: data.get("website") }),
      });
      if (response.ok) {
        setStatus("sent");
        setMessage(`确认邮件已发到 ${email}，点邮件里的链接完成订阅（没收到的话看看垃圾邮件）。`);
        return;
      }
      const body = (await response.json().catch(() => ({}))) as { error?: string };
      setStatus("error");
      setMessage(body.error ?? "订阅失败，请稍后再试");
    } catch {
      setStatus("error");
      setMessage("网络有点问题，请稍后再试");
    }
  };

  return (
    <div className={className}>
      {status === "sent" ? (
        <p role="status" className="text-sm text-emerald-600 dark:text-emerald-400">
          {message}
        </p>
      ) : (
        <form onSubmit={submit} className="flex flex-col gap-2 sm:flex-row">
          <label htmlFor={`${id}-email`} className="sr-only">
            邮箱地址
          </label>
          <input
            id={`${id}-email`}
            name="email"
            type="email"
            required
            maxLength={254}
            autoComplete="email"
            placeholder="你的邮箱"
            className="h-10 min-w-0 flex-1 rounded-full border border-line bg-paper px-4 text-sm text-ink outline-none transition-colors placeholder:text-ink-3 focus:border-accent"
          />
          {/* 拦机器人的隐藏字段：移出屏幕、读屏和 Tab 都跳过 */}
          <input name="website" tabIndex={-1} autoComplete="off" aria-hidden="true" className="absolute -left-[9999px] h-px w-px opacity-0" />
          <button
            type="submit"
            disabled={status === "sending"}
            className="h-10 shrink-0 rounded-full bg-btn px-5 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {status === "sending" ? "提交中…" : "订阅"}
          </button>
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
