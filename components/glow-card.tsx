import type { ReactNode, CSSProperties } from "react";

/**
 * 微光卡片。
 *
 * Keep this component server-rendered. CSS supplies the hover treatment and
 * avoids a mousemove/layout-measurement handler on every public card.
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
  return (
    <div
      className={`glow-card ${tilt ? "glow-card-tilt" : ""} ${className}`}
      style={style}
    >
      <div className="spotlight" />
      {children}
    </div>
  );
}