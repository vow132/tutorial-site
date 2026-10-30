"use client";

import Link from "next/link";
import { useState, type ComponentProps } from "react";

/**
 * 只在用户表现出意图（悬停、触摸、键盘聚焦）时才预取的 Link。
 *
 * 默认 Link 进入视口就预取：一个页面上的导航、页脚、卡片会同时发出
 * 二三十个预取请求，访问量越大服务器压力越大。悬停到点击通常有
 * 一两百毫秒，足够把目标页预取回来，跳转依然很快。
 */
export default function IntentLink({
  onMouseEnter,
  onTouchStart,
  onFocus,
  ...props
}: Omit<ComponentProps<typeof Link>, "prefetch">) {
  const [intent, setIntent] = useState(false);

  return (
    <Link
      {...props}
      prefetch={intent ? null : false}
      onMouseEnter={(event) => {
        setIntent(true);
        onMouseEnter?.(event);
      }}
      onTouchStart={(event) => {
        setIntent(true);
        onTouchStart?.(event);
      }}
      onFocus={(event) => {
        setIntent(true);
        onFocus?.(event);
      }}
    />
  );
}
