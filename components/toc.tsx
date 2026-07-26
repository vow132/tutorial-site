"use client";

import { useEffect, useId, useRef, useState } from "react";
import type { TocItem } from "@/lib/article";

const MOBILE_TOC_STORAGE_KEY = "toc:mobile-open";

/** 根据标题在视口中的位置，返回当前所在的小节。 */
function useActiveHeading(items: TocItem[]) {
  const [active, setActive] = useState<string>(items[0]?.id ?? "");

  useEffect(() => {
    const headings = items
      .map((i) => document.getElementById(i.id))
      .filter((el): el is HTMLElement => !!el);
    if (headings.length === 0) return;

    let frame = 0;
    const updateActive = () => {
      frame = 0;
      const offset = Math.max(140, window.innerHeight * 0.45);
      let current = headings[0].id;
      for (const heading of headings) {
        if (heading.getBoundingClientRect().top <= offset) current = heading.id;
        else break;
      }
      setActive((previous) => (previous === current ? previous : current));
    };
    const onScroll = () => {
      if (!frame) frame = window.requestAnimationFrame(updateActive);
    };
    updateActive();
    document.addEventListener("scroll", onScroll, { capture: true, passive: true });
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      document.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, [items]);

  return [active, setActive] as const;
}

function scrollToHeading(id: string) {
  document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
  history.replaceState(null, "", `#${id}`);
}

function Caret({ className = "" }: { className?: string }) {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 12 12"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <path d="m2.5 4.5 3.5 3.5 3.5-3.5" />
    </svg>
  );
}

/** 跟随滚动的文章目录（桌面端侧边栏），并高亮当前小节。 */
export default function Toc({ items }: { items: TocItem[] }) {
  const [active, setActive] = useActiveHeading(items);

  if (items.length === 0) return null;

  const jump = (e: React.MouseEvent, id: string) => {
    e.preventDefault();
    setActive(id);
    scrollToHeading(id);
  };

  return (
    <aside className="relative hidden min-w-0 self-stretch lg:block">
      <nav className="sticky top-24 max-h-[calc(100vh-7rem)] overflow-y-auto overscroll-contain pb-6" aria-label="本页目录">
        <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-ink-3">
          本页目录
        </p>
        <ul className="space-y-1 border-l border-line">
          {items.map((item) => (
            <li key={item.id}>
              <a
                href={`#${item.id}`}
                onClick={(e) => jump(e, item.id)}
                aria-current={active === item.id ? "location" : undefined}
                className={`-ml-px block border-l-2 py-1.5 pr-2 text-sm transition-all ${
                  item.level === 3 ? "pl-7" : "pl-4"
                } ${
                  active === item.id
                    ? "border-accent font-medium text-accent"
                    : "border-transparent text-ink-2 hover:text-ink"
                }`}
              >
                {item.text}
              </a>
            </li>
          ))}
        </ul>
      </nav>
    </aside>
  );
}

/**
 * 移动端本页目录：正文顶部的可折叠卡片，用户可自行开关。
 *
 * 用原生 checkbox 承载开关状态，未完成 hydration 时也能点开；
 * React 接管后负责记住用户偏好、平滑滚动与展开态高亮。
 */
export function MobileToc({ items }: { items: TocItem[] }) {
  const [active, setActive] = useActiveHeading(items);
  const [open, setOpen] = useState(false);
  const toggleId = useId();
  const panelId = useId();
  const toggleRef = useRef<HTMLInputElement | null>(null);
  const restoredRef = useRef(false);

  /*
   * 挂载时读一次真实状态：用户可能在 hydration 前就用原生 checkbox 点开了，
   * 那种情况要保持打开；否则回退到上次记住的偏好。
   *
   * 放在 ref 回调而不是 effect 里，是因为这时才第一次拿到真实 DOM 节点，
   * 且能在同一次提交内定好状态，避免先渲染成收起再跳成展开。
   */
  const attachToggle = (node: HTMLInputElement | null) => {
    toggleRef.current = node;
    if (!node || restoredRef.current) return;
    restoredRef.current = true;

    if (node.checked) {
      setOpen(true);
      return;
    }
    let stored: string | null = null;
    try {
      stored = window.localStorage.getItem(MOBILE_TOC_STORAGE_KEY);
    } catch {
      stored = null;
    }
    if (stored === "1") {
      node.checked = true;
      setOpen(true);
    }
  };

  if (items.length === 0) return null;

  const activeText = items.find((item) => item.id === active)?.text ?? items[0].text;

  const close = () => {
    if (toggleRef.current) toggleRef.current.checked = false;
    setOpen(false);
  };

  const jump = (e: React.MouseEvent, id: string) => {
    e.preventDefault();
    setActive(id);
    close();
    scrollToHeading(id);
  };

  return (
    <div className="mt-7 lg:hidden">
      <input
        ref={attachToggle}
        id={toggleId}
        type="checkbox"
        className="mobile-toc-toggle sr-only"
        aria-hidden="true"
        tabIndex={-1}
        onChange={(event) => {
          const next = event.currentTarget.checked;
          setOpen(next);
          try {
            window.localStorage.setItem(MOBILE_TOC_STORAGE_KEY, next ? "1" : "0");
          } catch {
            // 隐私模式下忽略持久化失败。
          }
        }}
      />

      <label
        htmlFor={toggleId}
        role="button"
        tabIndex={0}
        aria-controls={panelId}
        aria-expanded={open}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            toggleRef.current?.click();
          }
        }}
        className="mobile-toc-trigger flex w-full cursor-pointer items-center gap-3 rounded-2xl border border-line bg-white px-4 py-3 text-left transition-colors hover:bg-paper"
      >
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-accent-soft text-accent">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" aria-hidden="true">
            <path d="M2.5 4h11M2.5 8h8M2.5 12h5" />
          </svg>
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold text-ink">本页目录</span>
          <span className="mobile-toc-current mt-0.5 block truncate text-xs text-ink-3">
            当前：{activeText}
          </span>
        </span>
        <span className="shrink-0 rounded-full bg-paper px-2 py-0.5 text-[11px] text-ink-3">
          {items.length} 节
        </span>
        <Caret className="mobile-toc-caret shrink-0 text-ink-3 transition-transform duration-200" />
      </label>

      <nav
        id={panelId}
        aria-label="本页目录"
        className="mobile-toc-panel hidden max-h-[60vh] overflow-y-auto overscroll-contain rounded-b-2xl border border-t-0 border-line bg-white px-3 pb-3 pt-1"
      >
        <ul className="space-y-0.5 border-l border-line">
          {items.map((item) => (
            <li key={item.id}>
              <a
                href={`#${item.id}`}
                onClick={(e) => jump(e, item.id)}
                aria-current={active === item.id ? "location" : undefined}
                className={`-ml-px block border-l-2 py-2 pr-2 text-sm transition-colors ${
                  item.level === 3 ? "pl-6" : "pl-3.5"
                } ${
                  active === item.id
                    ? "border-accent font-medium text-accent"
                    : "border-transparent text-ink-2"
                }`}
              >
                {item.text}
              </a>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  );
}
