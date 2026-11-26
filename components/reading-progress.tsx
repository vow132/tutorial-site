"use client";

import { useEffect, useRef, useState } from "react";
import { sendBeacon } from "./view-beacon";
import { markTutorialRead } from "@/lib/reading-history";

/** 读到正文末尾、并且在页面上停留了这么久，才算「读完」（快速划到底不算）。 */
const MIN_READ_MS = 10_000;

/**
 * 文章页顶部的阅读进度条 + 右下角「回到顶部」。
 * 进度按正文（.article-body）计算：正文顶部到达屏幕顶端时为 0，正文末尾进入屏幕底部时为 100%。
 * 滚动监听是被动的，每帧最多算一次；打印时两者都隐藏。
 * 传了 tutorialId 时，正文末尾出现在屏幕上且停留满 10 秒，上报一次「读完」（仪表盘的读完率）。
 */
export default function ReadingProgress({ target = ".article-body", tutorialId }: { target?: string; tutorialId?: number }) {
  const bar = useRef<HTMLDivElement>(null);
  const [showTop, setShowTop] = useState(false);

  useEffect(() => {
    let frame = 0;
    const startedAt = Date.now();
    let reachedEnd = false;
    let reported = false;
    const reportRead = () => {
      if (reported || !tutorialId || !reachedEnd || Date.now() - startedAt < MIN_READ_MS) return;
      reported = true;
      // 「教程书」的阅读进度（只记在本浏览器里）
      markTutorialRead(tutorialId);
      try {
        const key = `read:${tutorialId}`;
        if (sessionStorage.getItem(key)) return;
        sessionStorage.setItem(key, "1");
      } catch {
        // 存储不可用时照常上报，由服务端去重
      }
      sendBeacon({ id: tutorialId, read: true });
    };
    const update = () => {
      frame = 0;
      const body = document.querySelector<HTMLElement>(target);
      const viewport = window.innerHeight;
      let progress = 1;
      if (body) {
        const box = body.getBoundingClientRect();
        const distance = box.height - viewport;
        progress = distance <= 0 ? (box.top <= 0 ? 1 : 0) : -box.top / distance;
        if (box.bottom <= viewport) reachedEnd = true;
      }
      reportRead();
      bar.current?.style.setProperty("transform", `scaleX(${Math.min(1, Math.max(0, progress))})`);
      setShowTop(window.scrollY > viewport * 1.5);
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    update();
    // 早早划到了末尾的读者：停留满 10 秒时再检查一次
    const readTimer = window.setTimeout(reportRead, MIN_READ_MS + 50);
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    return () => {
      window.clearTimeout(readTimer);
      cancelAnimationFrame(frame);
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
    };
  }, [target, tutorialId]);

  const backToTop = () => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    window.scrollTo({ top: 0, behavior: reduce ? "auto" : "smooth" });
    // 焦点移回页面开头，键盘用户接着按 Tab 从头开始，而不是停在消失的按钮上
    const main = document.getElementById("main");
    if (main) {
      main.tabIndex = -1;
      main.focus({ preventScroll: true });
    }
  };

  return (
    <>
      <div aria-hidden="true" className="print-hide pointer-events-none fixed inset-x-0 top-0 z-[60] h-[3px]">
        <div ref={bar} className="reading-progress h-full origin-left bg-accent" style={{ transform: "scaleX(0)" }} />
      </div>
      <button
        type="button"
        onClick={backToTop}
        aria-label="回到顶部"
        title="回到顶部"
        inert={!showTop}
        className={`back-to-top print-hide fixed bottom-6 right-4 z-[60] flex h-11 w-11 items-center justify-center rounded-full border border-line bg-surface text-ink-2 shadow-capsule transition-[opacity,transform] duration-200 hover:text-accent-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent sm:right-6 ${
          showTop ? "opacity-100" : "pointer-events-none translate-y-3 opacity-0"
        }`}
      >
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M8 13V3M3.5 7.5 8 3l4.5 4.5" />
        </svg>
      </button>
    </>
  );
}
