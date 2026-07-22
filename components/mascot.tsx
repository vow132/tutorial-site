"use client";

import { useEffect, useRef } from "react";

/**
 * 小幽灵吉祥物：常驻漂浮 + 眨眼，身体随鼠标轻微偏移（跟随设备动效）。
 */
export default function Mascot({ className = "" }: { className?: string }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el || window.matchMedia("(pointer: coarse)").matches) return;

    let raf = 0;
    let targetX = 0;
    let targetY = 0;
    let curX = 0;
    let curY = 0;

    const onMove = (e: MouseEvent) => {
      const rect = el.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      const dx = e.clientX - cx;
      const dy = e.clientY - cy;
      const dist = Math.hypot(dx, dy) || 1;
      const pull = Math.min(dist / 300, 1) * 10; // 最远被吸引 10px
      targetX = (dx / dist) * pull;
      targetY = (dy / dist) * pull;
    };

    const tick = () => {
      curX += (targetX - curX) * 0.08;
      curY += (targetY - curY) * 0.08;
      el.style.translate = `${curX.toFixed(2)}px ${curY.toFixed(2)}px`;
      raf = requestAnimationFrame(tick);
    };

    window.addEventListener("mousemove", onMove, { passive: true });
    raf = requestAnimationFrame(tick);
    return () => {
      window.removeEventListener("mousemove", onMove);
      cancelAnimationFrame(raf);
    };
  }, []);

  return (
    <div
      ref={ref}
      className={`pointer-events-none select-none ${className}`}
      aria-hidden
    >
      <div className="mascot-float">
        <svg width="34" height="38" viewBox="0 0 34 38" fill="none">
          <path
            d="M17 2C9.82 2 4 7.82 4 15v17.2c0 1.9 2.24 2.87 3.54 1.5l1.72-1.8a2.2 2.2 0 0 1 3.15.05l1.94 2a2.2 2.2 0 0 0 3.12.02l2.06-2.04a2.2 2.2 0 0 1 3.13-.02l1.8 1.79c1.32 1.3 3.54.35 3.54-1.57V15C30 7.82 24.18 2 17 2Z"
            fill="#fff"
            stroke="#dfe3ea"
            strokeWidth="1.6"
          />
          <g className="mascot-eyes">
            <circle cx="12.4" cy="14.6" r="1.9" fill="#17181c" />
            <circle cx="21.6" cy="14.6" r="1.9" fill="#17181c" />
          </g>
          <circle cx="9.6" cy="19.4" r="1.6" fill="#ffd9e0" opacity="0.9" />
          <circle cx="24.4" cy="19.4" r="1.6" fill="#ffd9e0" opacity="0.9" />
        </svg>
      </div>
    </div>
  );
}
