"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";

export type NavItem = { href: string; label: string };

/**
 * 悬浮胶囊导航：激活项弹簧滑动 + 光晕 + 流光。
 */
export default function CapsuleNav({ items }: { items: NavItem[] }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const drawerId = useId();
  const toggleId = useId();
  const toggleRef = useRef<HTMLInputElement>(null);
  const triggerRef = useRef<HTMLLabelElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const mountedRef = useRef(false);

  const isActive = (href: string) =>
    href === "/" ? pathname === "/" : pathname.startsWith(href);

  useEffect(() => {
    // 保留用户在 hydration 完成前通过原生 checkbox 打开的状态，
    // 避免慢设备上首击菜单没有反应。
    if (!mountedRef.current) {
      mountedRef.current = true;
      if (toggleRef.current?.checked) {
        setOpen(true);
        return;
      }
    }

    if (toggleRef.current) toggleRef.current.checked = open;

    if (!open) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeButtonRef.current?.focus();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        if (toggleRef.current) toggleRef.current.checked = false;
        setOpen(false);
        triggerRef.current?.focus();
      }
    };

    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  // 旋转屏幕或连接键盘后进入桌面布局时，自动收起抽屉并恢复页面滚动。
  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth >= 1024) setOpen(false);
    };

    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  const closeDrawer = () => {
    if (toggleRef.current) toggleRef.current.checked = false;
    setOpen(false);
    triggerRef.current?.focus();
  };

  return (
    <>
      {/* 桌面端胶囊 */}
      <nav className="hidden items-center gap-1 rounded-full border border-line bg-white/85 p-1.5 shadow-[0_8px_30px_-12px_rgba(23,24,28,0.18)] backdrop-blur-md lg:flex">
        {items.map((item) => {
          const active = isActive(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`relative rounded-full px-3 py-2 text-sm font-medium transition-colors xl:px-5 ${
                active ? "text-ink" : "text-ink-2 hover:text-ink"
              }`}
            >
              {active && (
                <span
                  className="absolute inset-0 overflow-hidden rounded-full bg-accent-soft"
                >
                  <span className="nav-aura absolute inset-0 rounded-full bg-accent/10 blur-[6px]" />
                  <span className="nav-shine absolute inset-y-0 w-1/3 bg-gradient-to-r from-transparent via-white/70 to-transparent" />
                </span>
              )}
              <span className="relative z-10">{item.label}</span>
            </Link>
          );
        })}
      </nav>

      {/* 移动端汉堡 */}
      <input
        ref={toggleRef}
        id={toggleId}
        type="checkbox"
        className="mobile-drawer-toggle sr-only lg:hidden"
        aria-hidden="true"
        tabIndex={-1}
        onChange={(event) => setOpen(event.currentTarget.checked)}
      />

      <label
        ref={triggerRef}
        htmlFor={toggleId}
        className="mobile-drawer-trigger flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center rounded-full border border-line bg-white/90 shadow-[0_8px_30px_-12px_rgba(23,24,28,0.18)] backdrop-blur-md transition-colors hover:bg-paper lg:hidden"
        role="button"
        tabIndex={0}
        aria-label="打开菜单"
        aria-controls={drawerId}
        aria-expanded={open}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            toggleRef.current?.click();
          }
        }}
      >
        <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
          <path d="M2.5 5h13M2.5 9h13M2.5 13h13" />
        </svg>
      </label>

      {/* 移动端左侧侧滑抽屉 */}
      <div
        className={`mobile-drawer-shell fixed inset-0 z-[70] lg:hidden ${
          open ? "pointer-events-auto" : "pointer-events-none"
        }`}
        aria-hidden={!open}
      >
        <label
          htmlFor={toggleId}
          aria-label="关闭菜单"
          role="button"
          tabIndex={open ? 0 : -1}
          onClick={closeDrawer}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === " ") closeDrawer();
          }}
          className={`mobile-drawer-backdrop absolute inset-0 touch-none bg-ink/35 backdrop-blur-[2px] transition-opacity duration-300 ${
            open ? "opacity-100" : "opacity-0"
          }`}
        />

        <aside
          id={drawerId}
          role="dialog"
          aria-modal="true"
          aria-label="网站菜单"
          className={`mobile-drawer-panel absolute inset-y-0 left-0 flex w-[min(86vw,22rem)] flex-col overscroll-contain border-r border-line bg-white shadow-2xl transition-transform duration-300 ease-out ${
            open ? "translate-x-0" : "-translate-x-full"
          }`}
        >
          <div className="flex items-center justify-between border-b border-line px-5 py-4 pt-[max(1rem,env(safe-area-inset-top))]">
            <div>
              <p className="text-xs font-medium uppercase tracking-[0.18em] text-ink-3">
                Navigation
              </p>
              <p className="mt-1 text-lg font-bold text-ink">菜单导航</p>
            </div>
            <button
              ref={closeButtonRef}
              type="button"
              onClick={closeDrawer}
              tabIndex={open ? 0 : -1}
              className="flex h-10 w-10 items-center justify-center rounded-full border border-line text-ink-2 transition-colors hover:bg-paper hover:text-ink"
              aria-label="关闭菜单"
            >
              <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
                <path d="M4 4l10 10M14 4 4 14" />
              </svg>
            </button>
          </div>

          <nav className="flex-1 overflow-y-auto px-3 py-4" aria-label="移动端导航">
            <div className="space-y-1.5">
              {items.map((item, index) => {
                const active = isActive(item.href);

                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    tabIndex={open ? 0 : -1}
                    onClick={closeDrawer}
                    className={`group flex items-center gap-3 rounded-2xl px-3.5 py-3 text-sm font-medium transition-colors ${
                      active
                        ? "bg-accent-soft text-ink"
                        : "text-ink-2 hover:bg-paper hover:text-ink"
                    }`}
                  >
                    <span
                      className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-xl text-xs font-semibold ${
                        active
                          ? "bg-accent text-white"
                          : "bg-paper text-ink-3 group-hover:text-ink-2"
                      }`}
                    >
                      {String(index + 1).padStart(2, "0")}
                    </span>
                    <span className="min-w-0 flex-1 truncate">{item.label}</span>
                    <svg
                      width="14"
                      height="14"
                      viewBox="0 0 14 14"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.6"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      className="shrink-0 opacity-45"
                      aria-hidden="true"
                    >
                      <path d="m5 3.5 3.5 3.5L5 10.5" />
                    </svg>
                  </Link>
                );
              })}
            </div>
          </nav>

          <div className="border-t border-line px-5 py-4 pb-[max(1rem,env(safe-area-inset-bottom))] text-xs leading-5 text-ink-3">
            选择栏目，快速浏览对应教程。
          </div>
        </aside>
      </div>
    </>
  );
}
