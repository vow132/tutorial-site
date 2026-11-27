"use client";

import { useState, useSyncExternalStore, type FormEvent } from "react";
import { MAX_FEEDBACK_MESSAGE } from "@/lib/feedback";
import TurnstileWidget from "@/components/turnstile-widget";
import { useI18n } from "@/lib/i18n/client";

type Choice = "yes" | "no";

const storageKey = (id: number) => `helpful:${id}`;

function readChoice(id: number): Choice | null {
  try {
    const value = localStorage.getItem(storageKey(id));
    return value === "yes" || value === "no" ? value : null;
  } catch {
    return null;
  }
}

function subscribe(onChange: () => void) {
  window.addEventListener("storage", onChange);
  return () => window.removeEventListener("storage", onChange);
}

/**
 * 文末「这篇教程对你有帮助吗？」。投过票的浏览器记在 localStorage 里，再打开显示已投；
 * 服务端另外按 IP 去重（app/api/feedback/route.ts）。文章页是缓存页，所以状态只在浏览器端读取。
 * 后台开启了人机验证时（turnstileSiteKey），留言框出现时才加载 Cloudflare 的小组件，投票本身不需要验证。
 */
export default function HelpfulFeedback({ id, turnstileSiteKey = null }: { id: number; turnstileSiteKey?: string | null }) {
  const stored = useSyncExternalStore(subscribe, () => readChoice(id), () => null);
  const [voted, setVoted] = useState<Choice | null>(null);
  const [note, setNote] = useState<"idle" | "sending" | "sent" | "failed" | "waiting">("idle");
  const [token, setToken] = useState<string | null>(null);
  const [checkFailed, setCheckFailed] = useState(false);
  const [resetKey, setResetKey] = useState(0);
  const choice = voted ?? stored;
  const { m } = useI18n();
  const t = m.reader.helpful;

  // 「没帮助」之后可以留一句话（只发给站长，不公开）
  const sendNote = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const message = String(new FormData(event.currentTarget).get("message") ?? "").trim();
    if (message.length < 2) return;
    if (turnstileSiteKey && !token && !checkFailed) {
      setNote("waiting");
      return;
    }
    setNote("sending");
    let sent = false;
    try {
      const response = await fetch("/api/feedback/message", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, message, turnstileToken: token }),
      });
      sent = response.ok;
    } catch {
      // 当作没发出去
    }
    setNote(sent ? "sent" : "failed");
    // 令牌只能用一次，没发出去就重新验证
    if (!sent && turnstileSiteKey) setResetKey((value) => value + 1);
  };

  const vote = (value: Choice) => {
    if (choice) return;
    setVoted(value);
    try {
      localStorage.setItem(storageKey(id), value);
    } catch {
      // 隐私模式：这次照样计票，只是下次打开不记得投过
    }
    void fetch("/api/feedback", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, helpful: value === "yes" }),
      keepalive: true,
    }).catch(() => {});
  };

  const button = (value: Choice, label: string, icon: string) => {
    const selected = choice === value;
    return (
      <button
        type="button"
        onClick={() => vote(value)}
        disabled={Boolean(choice)}
        aria-pressed={selected}
        className={`inline-flex h-10 items-center gap-2 rounded-full border px-5 text-sm font-medium transition-colors disabled:cursor-default ${
          selected
            ? "border-accent bg-accent-soft text-accent-ink"
            : "border-line bg-paper text-ink-2 enabled:hover:border-accent/60 enabled:hover:text-ink disabled:opacity-60"
        }`}
      >
        <span aria-hidden="true">{icon}</span>
        {label}
      </button>
    );
  };

  return (
    <section
      aria-labelledby="helpful-heading"
      className="helpful-feedback print-hide mt-12 flex flex-col items-center gap-4 rounded-2xl border border-line bg-surface px-6 py-7 text-center"
    >
      <h2 id="helpful-heading" className="text-base font-semibold text-ink">
        {t.question}
      </h2>
      <div className="flex flex-wrap justify-center gap-3">
        {button("yes", t.yes, "👍")}
        {button("no", t.no, "👎")}
      </div>
      <p role="status" className="min-h-5 text-sm text-ink-3">
        {note === "sent"
          ? t.noteSent
          : choice === "yes"
            ? t.thanksYes
            : choice === "no"
              ? t.thanksNo
              : ""}
      </p>
      {voted === "no" && note !== "sent" && (
        <form onSubmit={sendNote} className="w-full max-w-lg text-left">
          <label htmlFor="helpful-note" className="mb-1.5 block text-sm text-ink-2">
            {t.noteLabel}
            <span className="text-ink-3">{t.noteHint}</span>
          </label>
          <textarea
            id="helpful-note"
            name="message"
            rows={3}
            maxLength={MAX_FEEDBACK_MESSAGE}
            placeholder={t.notePlaceholder}
            className="w-full rounded-xl border border-line bg-paper px-3 py-2 text-sm text-ink outline-none transition-colors placeholder:text-ink-3 focus:border-accent"
          />
          {turnstileSiteKey && (
            <TurnstileWidget
              className="mt-2"
              siteKey={turnstileSiteKey}
              action="feedback"
              resetKey={resetKey}
              onToken={(value) => {
                setToken(value);
                if (value) setCheckFailed(false);
              }}
              onError={() => setCheckFailed(true)}
            />
          )}
          <div className="mt-2 flex items-center justify-end gap-3">
            {note === "failed" && <span className="text-xs text-red-500 dark:text-red-400">{t.noteFailed}</span>}
            {note === "waiting" && <span className="text-xs text-ink-3">{t.noteWaiting}</span>}
            <button
              type="submit"
              disabled={note === "sending"}
              className="h-9 rounded-full bg-btn px-4 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
            >
              {note === "sending" ? t.sending : t.send}
            </button>
          </div>
        </form>
      )}
    </section>
  );
}
