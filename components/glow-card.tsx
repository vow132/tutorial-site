"use client";

import { useRef, type ReactNode, type CSSProperties } from "react";

/**
 * 微光卡片：鼠标跟随的聚光灯光斑 + 轻微 3D 倾斜。
 */
export default function GlowCard({
  children,
  className = "",
  tilt = true,
  style,
}: {
  children: ReactNode;
  className?: string;
  tilt?: boolean;
  style?: CSSProperties;
}) {
  const ref = useRef<HTMLDivElement>(null);

  const onMouseMove = (e: React.MouseEvent) => {
    const el = ref.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    const spot = el.querySelector<HTMLElement>(".spotlight");
    if (spot) {
      spot.style.background = `radial-gradient(420px circle at ${x}px ${y}px, rgba(99,102,241,0.08), transparent 65%)`;
    }

    if (tilt) {
      const rx = ((y / rect.height) - 0.5) * -3.2;
      const ry = ((x / rect.width) - 0.5) * 3.2;
      el.style.transform = `perspective(900px) rotateX(${rx}deg) rotateY(${ry}deg) translateY(-2px)`;
    }
  };

  const onMouseLeave = () => {
    const el = ref.current;
    if (!el) return;
    el.style.transform = "";
  };

  return (
    <div
      ref={ref}
      className={`glow-card ${className}`}
      style={style}
      onMouseMove={onMouseMove}
      onMouseLeave={onMouseLeave}
    >
      <div className="spotlight" />
      {children}
    </div>
  );
}
