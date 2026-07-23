"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";
import { categoryLinkTarget, isExternalHref } from "@/lib/categories";

export type NavItem = {
  key: string;
  href: string;
  label: string;
  children?: NavItem[];
};

function hrefIsActive(pathname: string, href: string) {
  if (!href.startsWith("/") || href.startsWith("//")) return false;
  return href === "/" ? pathname === "/" : pathname.startsWith(href);
}

function itemIsActive(pathname: string, item: NavItem): boolean {
  return (
    hrefIsActive(pathname, item.href) ||
    Boolean(item.children?.some((child) => itemIsActive(pathname, child)))
  );
}

function Chevron({ className = "" }: { className?: string }) {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 12 12"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <path d="m4 2.5 3.5 3.5L4 9.5" />
    </svg>
  );
}

function DesktopSubmenu({
  items,
  pathname,
}: {
  items: NavItem[];
  pathname: string;
}) {
  return (
    <ul className="min-w-52 rounded-2xl border border-line bg-white/95 p-2 shadow-[0_18px_50px_-20px_rgba(23,24,28,0.28)] backdrop-blur-xl">
      {items.map((item) => {
        const active = itemIsActive(pathname, item);
        const hasChildren = Boolean(item.children?.length);
        const external = isExternalHref(item.href);

        return (
          <li key={item.key} className="group/submenu relative">
            <Link
              href={item.href}
              {...categoryLinkTarget(item.href)}
              aria-haspopup={hasChildren ? "menu" : undefined}
              className={`flex min-h-10 items-center gap-2 rounded-xl px-3 py-2 text-sm transition-colors ${
                active
                  ? "bg-accent-soft font-semibold text-accent"
                  : "text-ink-2 hover:bg-paper hover:text-ink"
              }`}
            >
              <span className="min-w-0 flex-1 truncate">{item.label}</span>
              {external ? (
                <svg
                  width="12"
                  height="12"
                  viewBox="0 0 12 12"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  aria-hidden="true"
                  className="shrink-0 opacity-50"
                >
                  <path d="M4.5 2.5h5v5M9.5 2.5l-7 7" />
                </svg>
              ) : hasChildren ? (
                <Chevron className="shrink-0 opacity-50 transition-transform group-hover/submenu:translate-x-0.5" />
              ) : null}
            </Link>

            {hasChildren && (
              <div className="invisible absolute -top-2 left-full z-40 pl-2 opacity-0 transition-[opacity,visibility] duration-150 group-hover/submenu:visible group-hover/submenu:opacity-100 group-focus-within/submenu:visible group-focus-within/submenu:opacity-100">
                <DesktopSubmenu items={item.children!} pathname={pathname} />
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}

function MobileNavItem({
  item,
  index,
  level,
  open,
  pathname,
  closeDrawer,
}: {
  item: NavItem;
  index?: number;
  level: number;
  open: boolean;
  pathname: string;
  closeDrawer: () => void;
}) {
  const active = itemIsActive(pathname, item);
  const hasChildren = Boolean(item.children?.length);
  const external = isExternalHref(item.href);
  const [expanded, setExpanded] = useState(active);

  return (
    <div>
      <div className="flex items-center gap-1">
        <Link
          href={item.href}
          {...categoryLinkTarget(item.href)}
          tabIndex={open ? 0 : -1}
          onClick={closeDrawer}
          className={`group flex min-h-11 min-w-0 flex-1 items-center gap-3 rounded-2xl px-3.5 py-2.5 text-sm font-medium transition-colors ${
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
            {index === undefined ? "↳" : String(index + 1).padStart(2, "0")}
          </span>
          <span className="min-w-0 flex-1 truncate">{item.label}</span>
          {external ? (
            <span className="text-xs opacity-45">↗</span>
          ) : !hasChildren ? (
            <Chevron className="shrink-0 opacity-45" />
          ) : null}
        </Link>
        {hasChildren && (
          <button
            type="button"
            tabIndex={open ? 0 : -1}
            aria-label={`${expanded ? "收起" : "展开"}${item.label}子分类`}
            aria-expanded={expanded}
            onClick={() => setExpanded((value) => !value)}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-line text-ink-2 transition-colors hover:bg-paper hover:text-ink focus-visible:outline-2 focus-visible:outline-accent"
          >
            <Chevron
              className={`transition-transform ${expanded ? "rotate-90" : ""}`}
            />
          </button>
        )}
      </div>

      {hasChildren && expanded && (
        <div
          className="ml-7 mt-1 space-y-1 border-l border-line pl-2"
          style={{ marginLeft: `${Math.min(level + 1, 2) * 1.25 + 0.5}rem` }}
        >
          {item.children!.map((child) => (
            <MobileNavItem
              key={child.key}
              item={child}
              level={level + 1}
              open={open}
              pathname={pathname}
              closeDrawer={closeDrawer}
            />
          ))}
        </div>
      )}
    </div>
  );
}

/** 悬浮胶囊导航：桌面端悬停多级菜单，移动端侧滑树形菜单。 */
export default function CapsuleNav({ items }: { items: NavItem[] }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const drawerId = useId();
  const toggleId = useId();
  const toggleRef = useRef<HTMLInputElement>(null);
  const triggerRef = useRef<HTMLLabelElement>(null);
  const closeButtonRef = useRef<HTMLLabelElement>(null);
  const mountedRef = useRef(false);

  useEffect(() => {
    // 保留用户在 hydration 完成前通过原生 checkbox 打开的状态。
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
      <nav className="hidden items-center gap-1 rounded-full border border-line bg-white/85 p-1.5 shadow-[0_8px_30px_-12px_rgba(23,24,28,0.18)] backdrop-blur-md lg:flex">
        {items.map((item) => {
          const active = itemIsActive(pathname, item);
          const hasChildren = Boolean(item.children?.length);

          return (
            <div key={item.key} className="group/nav relative">
              <Link
                href={item.href}
                {...categoryLinkTarget(item.href)}
                aria-haspopup={hasChildren ? "menu" : undefined}
                className={`relative flex items-center gap-1 rounded-full px-3 py-2 text-sm font-medium transition-colors xl:px-5 ${
                  active ? "text-ink" : "text-ink-2 hover:text-ink"
                }`}
              >
                {active && (
                  <span className="absolute inset-0 overflow-hidden rounded-full bg-accent-soft">
                    <span className="nav-aura absolute inset-0 rounded-full bg-accent/10 blur-[6px]" />
                    <span className="nav-shine absolute inset-y-0 w-1/3 bg-gradient-to-r from-transparent via-white/70 to-transparent" />
                  </span>
                )}
                <span className="relative z-10">{item.label}</span>
                {hasChildren && (
                  <svg
                    width="11"
                    height="11"
                    viewBox="0 0 11 11"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    className="relative z-10 transition-transform group-hover/nav:rotate-180"
                    aria-hidden="true"
                  >
                    <path d="m2.5 4 3 3 3-3" />
                  </svg>
                )}
              </Link>

              {hasChildren && (
                <div className="invisible absolute left-1/2 top-full z-30 -translate-x-1/2 pt-3 opacity-0 transition-[opacity,visibility] duration-150 group-hover/nav:visible group-hover/nav:opacity-100 group-focus-within/nav:visible group-focus-within/nav:opacity-100">
                  <DesktopSubmenu items={item.children!} pathname={pathname} />
                </div>
              )}
            </div>
          );
        })}
      </nav>

      <input
        ref={toggleRef}
        id={toggleId}
        type="checkbox"
        className="mobile-drawer-toggle sr-only lg:hidden"
        aria-hidden="true"
        tabIndex={-1}
        onChange={(event) => {
          const nextOpen = event.currentTarget.checked;
          setOpen(nextOpen);
          if (!nextOpen) requestAnimationFrame(() => triggerRef.current?.focus());
        }}
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

      <div
        className="mobile-drawer-shell pointer-events-none fixed inset-0 z-[70] lg:hidden"
        aria-hidden={!open}
      >
        <label
          htmlFor={toggleId}
          aria-label="关闭菜单"
          role="button"
          tabIndex={open ? 0 : -1}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              closeDrawer();
            }
          }}
          className="mobile-drawer-backdrop absolute inset-0 touch-none bg-ink/35 opacity-0 backdrop-blur-[2px] transition-opacity duration-300"
        />

        <aside
          id={drawerId}
          role="dialog"
          aria-modal="true"
          aria-label="网站菜单"
          className="mobile-drawer-panel absolute inset-y-0 left-0 flex w-[min(86vw,22rem)] flex-col overscroll-contain border-r border-line bg-white shadow-2xl transition-transform duration-300 ease-out"
        >
          <div className="flex items-center justify-between border-b border-line px-5 py-4 pt-[max(1rem,env(safe-area-inset-top))]">
            <div>
              <p className="text-xs font-medium uppercase tracking-[0.18em] text-ink-3">
                Navigation
              </p>
              <p className="mt-1 text-lg font-bold text-ink">菜单导航</p>
            </div>
            <label
              ref={closeButtonRef}
              htmlFor={toggleId}
              role="button"
              tabIndex={open ? 0 : -1}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  closeDrawer();
                }
              }}
              className="flex h-10 w-10 cursor-pointer items-center justify-center rounded-full border border-line text-ink-2 transition-colors hover:bg-paper hover:text-ink focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-2"
              aria-label="关闭菜单"
            >
              <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
                <path d="M4 4l10 10M14 4 4 14" />
              </svg>
            </label>
          </div>

          <nav className="flex-1 overflow-y-auto px-3 py-4" aria-label="移动端导航">
            <div className="space-y-1.5">
              {items.map((item, index) => (
                <MobileNavItem
                  key={item.key}
                  item={item}
                  index={index}
                  level={0}
                  open={open}
                  pathname={pathname}
                  closeDrawer={closeDrawer}
                />
              ))}
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
