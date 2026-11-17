"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/** 当前可见的搜索框：桌面在页眉，手机在搜索页顶部。 */
function visibleSearchInput() {
  const candidates = document.querySelectorAll<HTMLInputElement>('form[role="search"] input[name="q"], #mobile-search-query');
  return [...candidates].find((input) => input.offsetParent !== null) ?? null;
}

/**
 * 键盘快捷键：按 / 或 Ctrl/⌘+K 直接开始搜索（正在输入时 / 不拦截）。
 * 没有可见的搜索框时（手机页眉只有图标）跳到搜索页。
 */
export default function SearchShortcut() {
  const router = useRouter();
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.isComposing) return;
      const target = event.target as HTMLElement | null;
      const typing = target?.closest("input, textarea, select, [contenteditable=''], [contenteditable='true']");
      const slash = event.key === "/" && !event.ctrlKey && !event.metaKey && !event.altKey && !typing;
      const commandK = event.key.toLowerCase() === "k" && (event.metaKey || event.ctrlKey) && !event.altKey;
      if (!slash && !commandK) return;
      event.preventDefault();
      const input = visibleSearchInput();
      if (input) {
        input.focus();
        input.select();
      } else {
        router.push("/search");
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [router]);
  return null;
}
