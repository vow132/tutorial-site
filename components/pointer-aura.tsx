"use client";

import { useEffect } from "react";

/**
 * 全站唯一的指针监听器（rAF 节流）：
 * - 为悬停中的 .glow-card 写入聚光灯坐标 --mx/--my 与轻微 3D 倾斜 --rx/--ry；
 * - 驱动吉祥物（.site-mascot）平滑跟随指针，空闲 2.6s 后回到栖位。
 *
 * 仅精确指针且未开启「减少动态」时启用；触屏与减弱动态用户保持静态呈现。
 * 卡片本身仍是服务端渲染，无逐卡 handler。
 */
export default function PointerAura() {
  useEffect(() => {
    if (!window.matchMedia("(pointer: fine)").matches) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const mascot = document.querySelector<HTMLElement>(".site-mascot");
    const TILT = 2.2; // 最大倾斜角（度）

    let raf = 0;
    let card: HTMLElement | null = null;
    let cardRect: DOMRect | null = null;
    let mascotBase: { x: number; y: number } | null = null;
    let gx = 0;
    let gy = 0;
    let tgx = 0;
    let tgy = 0;
    let idleTimer = 0;

    const clearCard = () => {
      if (!card) return;
      for (const name of ["--mx", "--my", "--rx", "--ry", "--lift"]) {
        card.style.removeProperty(name);
      }
      card = null;
      cardRect = null;
    };

    const settled = () => Math.abs(tgx - gx) < 0.1 && Math.abs(tgy - gy) < 0.1;

    const frame = () => {
      gx += (tgx - gx) * 0.14;
      gy += (tgy - gy) * 0.14;
      mascot?.style.setProperty("--gx", `${gx.toFixed(2)}px`);
      mascot?.style.setProperty("--gy", `${gy.toFixed(2)}px`);
      raf = settled() && !card ? 0 : requestAnimationFrame(frame);
    };

    const ensureLoop = () => {
      if (!raf) raf = requestAnimationFrame(frame);
    };

    const onMove = (e: PointerEvent) => {
      const target = e.target instanceof Element
        ? e.target.closest<HTMLElement>(".glow-card")
        : null;
      if (target !== card) {
        clearCard();
        if (target) {
          card = target;
          cardRect = card.getBoundingClientRect();
        }
      } else if (card) {
        cardRect = card.getBoundingClientRect();
      }
      if (card && cardRect) {
        const x = e.clientX - cardRect.left;
        const y = e.clientY - cardRect.top;
        card.style.setProperty("--mx", `${x.toFixed(1)}px`);
        card.style.setProperty("--my", `${y.toFixed(1)}px`);
        card.style.setProperty(
          "--ry",
          `${(((x / cardRect.width) * 2 - 1) * TILT).toFixed(2)}deg`,
        );
        card.style.setProperty(
          "--rx",
          `${(-((y / cardRect.height) * 2 - 1) * TILT).toFixed(2)}deg`,
        );
        card.style.setProperty("--lift", "-2px");
      }

      if (mascot) {
        // 首次移动时记录未变换的栖位中心；display:none（窄屏）则不跟随。
        const rect = mascot.getBoundingClientRect();
        if (!mascotBase && rect.width > 0) {
          mascotBase = { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
        }
        if (mascotBase) {
          tgx = e.clientX - mascotBase.x;
          tgy = e.clientY - mascotBase.y - 30; // 悬停在指针上方一点
        }
      }

      clearTimeout(idleTimer);
      idleTimer = window.setTimeout(() => {
        tgx = 0;
        tgy = 0;
        clearCard();
      }, 2600);
      ensureLoop();
    };

    const onLeave = () => {
      tgx = 0;
      tgy = 0;
      clearCard();
      ensureLoop();
    };

    window.addEventListener("pointermove", onMove, { passive: true });
    document.documentElement.addEventListener("pointerleave", onLeave);
    return () => {
      window.removeEventListener("pointermove", onMove);
      document.documentElement.removeEventListener("pointerleave", onLeave);
      cancelAnimationFrame(raf);
      clearTimeout(idleTimer);
      clearCard();
    };
  }, []);

  return null;
}
