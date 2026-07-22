import type { CSSProperties, ReactNode } from "react";

/**
 * 首屏渐显。
 *
 * This is intentionally a server component. The previous Framer Motion
 * implementation rendered every block with opacity: 0 and depended on
 * hydration. If a proxy delayed a JS chunk, the home page looked blank.
 * CSS keeps the enhancement while the markup remains readable without JS.
 */
export default function Reveal({
  children,
  delay = 0,
  y = 22,
  className = "",
}: {
  children: ReactNode;
  delay?: number;
  y?: number;
  className?: string;
}) {
  const style = {
    animationDelay: `${delay}s`,
    "--reveal-y": `${y}px`,
  } as CSSProperties;

  return (
    <div className={`reveal ${className}`} style={style}>
      {children}
    </div>
  );
}