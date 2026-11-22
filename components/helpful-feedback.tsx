"use client";

import { useState, useSyncExternalStore, type FormEvent } from "react";
import { MAX_FEEDBACK_MESSAGE } from "@/lib/feedback";

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
 */
export default function HelpfulFeedback({ id }: { id: number }) {
  const stored = useSyncExternalStore(subscribe, () => readChoice(id), () => null);
  const [voted, setVoted] = useState<Choice | null>(null);
  const [note, setNote] = useState<"idle" | "sending" | "sent" | "failed">("idle");
  const choice = voted ?? stored;

  // 「没帮助」之后可以留一句话（只发给站长，不公开）
  const sendNote = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const message = String(new FormData(event.currentTarget).get("message") ?? "").trim();
    if (message.length < 2) return;
    setNote("sending");
    try {
      const response = await fetch("/api/feedback/message", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, message }),
      });
      setNote(response.ok ? "sent" : "failed");
    } catch {
      setNote("failed");
    }
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
        这篇教程对你有帮助吗？
      </h2>
      <div className="flex flex-wrap justify-center gap-3">
        {button("yes", "有帮助", "👍")}
        {button("no", "没帮助", "👎")}
      </div>
      <p role="status" className="min-h-5 text-sm text-ink-3">
        {note === "sent"
          ? "收到了，谢谢你花时间写下来！"
          : choice === "yes"
            ? "谢谢你的反馈！"
            : choice === "no"
              ? "谢谢反馈，我们会继续改进这篇教程。"
              : ""}
      </p>
      {voted === "no" && note !== "sent" && (
        <form onSubmit={sendNote} className="w-full max-w-lg text-left">
          <label htmlFor="helpful-note" className="mb-1.5 block text-sm text-ink-2">
            哪里没讲清楚？<span className="text-ink-3">（选填，只有站长能看到）</span>
          </label>
          <textarea
            id="helpful-note"
            name="message"
            rows={3}
            maxLength={MAX_FEEDBACK_MESSAGE}
            placeholder="例如：第三步的命令在 Windows 上报错……"
            className="w-full rounded-xl border border-line bg-paper px-3 py-2 text-sm text-ink outline-none transition-colors placeholder:text-ink-3 focus:border-accent"
          />
          <div className="mt-2 flex items-center justify-end gap-3">
            {note === "failed" && <span className="text-xs text-red-500 dark:text-red-400">没发出去，请稍后再试</span>}
            <button
              type="submit"
              disabled={note === "sending"}
              className="h-9 rounded-full bg-btn px-4 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
            >
              {note === "sending" ? "发送中…" : "发送"}
            </button>
          </div>
        </form>
      )}
    </section>
  );
}
