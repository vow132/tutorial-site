import type { CSSProperties, ReactNode } from "react";

/**
 * 渐显。
 *
 * This is intentionally a server component. The previous Framer Motion
 * implementation rendered every block with opacity: 0 and depended on
 * hydration. If a proxy delayed a JS chunk, the home page looked blank.
 * CSS keeps the enhancement while the markup remains readable without JS.
 *
 * mode="load"（默认）：挂载即播，适合首屏 Hero 的入场编排。
 * mode="scroll"：进入视口才浮现（CSS 滚动时间线渐进增强，
 * 不支持的浏览器直接可见），适合首屏以下的分区内容。
 * fade={false}：只做上移、不从透明开始，用于首屏主标题等最大内容元素，
 * 否则浏览器要等淡入后才把它算作已绘制，首屏指标（LCP）会被拖后。
 */
export default function Reveal({
  children,
  delay = 0,
  y = 22,
  className = "",
  mode = "load",
  fade = true,
}: {
  children: ReactNode;
  delay?: number;
  y?: number;
  className?: string;
  mode?: "load" | "scroll";
  fade?: boolean;
}) {
  if (mode === "scroll") {
    return <div className={`reveal-scroll ${className}`}>{children}</div>;
  }

  const style = {
    animationDelay: `${delay}s`,
    "--reveal-y": `${y}px`,
  } as CSSProperties;

  return (
    <div className={`${fade ? "reveal" : "reveal-rise"} ${className}`} style={style}>
      {children}
    </div>
  );
}
