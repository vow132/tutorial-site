"use client";

import type { ReactNode } from "react";
import { useEffect, useId, useRef } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { logout } from "@/lib/actions/auth";

type AdminItem = {
  href: string;
  label: string;
  icon: ReactNode;
};

const items: AdminItem[] = [
  {
    href: "/admin",
    label: "仪表盘",
    icon: <path d="M3 3h7v7H3zM11 3h7v4h-7zM11 10h7v7h-7zM3 13h7v4H3z" />,
  },
  {
    href: "/admin/tutorials",
    label: "教程管理",
    icon: <path d="M4 4.5A2.5 2.5 0 0 1 6.5 2H20v15.5H6.5A2.5 2.5 0 0 0 4 20zM4 17.5V4.5M20 17.5V20H6.5" />,
  },
  {
    href: "/admin/categories",
    label: "分类管理",
    icon: <path d="M3.5 3.5h6v6h-6zM11.5 3.5h6v6h-6zM3.5 11.5h6v6h-6zM11.5 11.5h6v6h-6z" />,
  },
  {
    href: "/admin/settings",
    label: "站点设置",
    icon: (
      <>
        <circle cx="11" cy="11" r="3" />
        <path d="M11 2.5v2.2M11 17.3v2.2M2.5 11h2.2M17.3 11h2.2M5 5l1.6 1.6M15.4 15.4L17 17M17 5l-1.6 1.6M6.6 15.4L5 17" />
      </>
    ),
  },
  {
    href: "/admin/account",
    label: "账号安全",
    icon: (
      <>
        <rect x="4" y="3" width="14" height="16" rx="2" />
        <circle cx="11" cy="8" r="2" />
        <path d="M7.5 15c.8-1.7 2-2.5 3.5-2.5s2.7.8 3.5 2.5" />
      </>
    ),
  },
];

function isActivePath(pathname: string, href: string) {
  return href === "/admin" ? pathname === "/admin" : pathname.startsWith(href);
}

function SidebarLinks({
  pathname,
  onNavigate,
}: {
  pathname: string;
  onNavigate?: () => void;
}) {
  return (
    <>
      <nav className="space-y-1" aria-label="后台导航">
        {items.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            className={`flex items-center gap-3 rounded-2xl px-4 py-2.5 text-sm font-medium transition-colors ${
              isActivePath(pathname, item.href)
                ? "bg-accent-soft text-accent"
                : "text-ink-2 hover:bg-paper hover:text-ink"
            }`}
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 22 22"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.7"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              {item.icon}
            </svg>
            {item.label}
          </Link>
        ))}
      </nav>

      <div className="mt-3 space-y-1 border-t border-line pt-3">
        <Link
          href="/"
          target="_blank"
          onClick={onNavigate}
          className="flex items-center gap-3 rounded-2xl px-4 py-2.5 text-sm font-medium text-ink-2 transition-colors hover:bg-paper hover:text-ink"
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 22 22"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.7"
            strokeLinecap="round"
            aria-hidden="true"
          >
            <path d="M9 4H4v14h14v-5M13 3h6v6M19 3l-8 8" />
          </svg>
          查看网站
        </Link>
        <form action={logout}>
          <button
            type="submit"
            className="flex w-full items-center gap-3 rounded-2xl px-4 py-2.5 text-sm font-medium text-red-500 transition-colors hover:bg-red-50"
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 22 22"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.7"
              strokeLinecap="round"
              aria-hidden="true"
            >
              <path d="M14 4h4v14h-4M10 7l-4 4 4 4M6 11h9" />
            </svg>
            退出登录
          </button>
        </form>
      </div>
    </>
  );
}

export default function AdminSidebar() {
  const pathname = usePathname();
  const toggleId = useId();
  const drawerId = useId();
  const toggleRef = useRef<HTMLInputElement>(null);
  const triggerRef = useRef<HTMLLabelElement>(null);

  const currentItem =
    items.find((item) => isActivePath(pathname, item.href)) ?? items[0];

  const closeMobileMenu = (restoreFocus = false) => {
    if (toggleRef.current) toggleRef.current.checked = false;
    triggerRef.current?.setAttribute("aria-expanded", "false");
    if (restoreFocus) triggerRef.current?.focus();
  };

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && toggleRef.current?.checked) {
        closeMobileMenu(true);
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, []);

  return (
    <>
      <div className="sticky top-[max(1rem,env(safe-area-inset-top))] z-[80] md:hidden">
        <input
          ref={toggleRef}
          id={toggleId}
          type="checkbox"
          className="admin-mobile-drawer-toggle sr-only"
          aria-hidden="true"
          tabIndex={-1}
          onChange={(event) => {
            triggerRef.current?.setAttribute(
              "aria-expanded",
              String(event.currentTarget.checked),
            );
          }}
        />

        <div className="flex min-h-14 items-center justify-between gap-3 rounded-2xl border border-line bg-white/90 py-2 pl-4 pr-2 shadow-[0_10px_32px_-18px_rgba(23,24,28,0.24)] backdrop-blur-md">
          <div className="min-w-0">
            <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-ink-3">
              Admin Panel
            </p>
            <p className="truncate text-sm font-semibold text-ink">
              {currentItem.label}
            </p>
          </div>
          <label
            ref={triggerRef}
            htmlFor={toggleId}
            role="button"
            tabIndex={0}
            aria-label="打开后台菜单"
            aria-controls={drawerId}
            aria-expanded="false"
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                toggleRef.current?.click();
              }
            }}
            className="admin-mobile-drawer-trigger flex h-10 w-10 shrink-0 cursor-pointer items-center justify-center rounded-xl border border-line bg-paper text-ink-2 transition-colors hover:text-ink focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-2"
          >
            <svg
              width="18"
              height="18"
              viewBox="0 0 18 18"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              aria-hidden="true"
            >
              <path d="M2.5 5h13M2.5 9h13M2.5 13h13" />
            </svg>
          </label>
        </div>

        <div className="admin-mobile-drawer-shell pointer-events-none fixed inset-0 z-[90] md:hidden">
          <label
            htmlFor={toggleId}
            role="button"
            tabIndex={0}
            aria-label="关闭后台菜单"
            className="admin-mobile-drawer-backdrop absolute inset-0 cursor-pointer bg-ink/45 opacity-0 backdrop-blur-[2px] transition-opacity duration-300"
          />

          <aside
            id={drawerId}
            role="dialog"
            aria-modal="true"
            aria-label="后台菜单"
            className="admin-mobile-drawer-panel absolute inset-y-0 left-0 flex w-[min(86vw,20rem)] flex-col border-r border-line bg-white shadow-2xl transition-transform duration-300 ease-out"
          >
            <div className="flex items-center justify-between border-b border-line px-5 py-4 pt-[max(1rem,env(safe-area-inset-top))]">
              <div>
                <p className="text-xs font-medium uppercase tracking-[0.18em] text-ink-3">
                  Admin Panel
                </p>
                <p className="mt-1 text-lg font-bold text-ink">后台管理</p>
              </div>
              <label
                htmlFor={toggleId}
                role="button"
                tabIndex={0}
                aria-label="关闭后台菜单"
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    closeMobileMenu(true);
                  }
                }}
                className="admin-mobile-drawer-close flex h-10 w-10 cursor-pointer items-center justify-center rounded-full border border-line text-ink-2 transition-colors hover:bg-paper hover:text-ink focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-2"
              >
                <svg
                  width="18"
                  height="18"
                  viewBox="0 0 18 18"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  aria-hidden="true"
                >
                  <path d="M4 4l10 10M14 4 4 14" />
                </svg>
              </label>
            </div>

            <div className="flex-1 overflow-y-auto p-3">
              <SidebarLinks
                pathname={pathname}
                onNavigate={() => closeMobileMenu()}
              />
            </div>
          </aside>
        </div>
      </div>

      <aside className="sticky top-6 hidden h-fit w-52 shrink-0 rounded-3xl border border-line bg-white p-3 md:block">
        <SidebarLinks pathname={pathname} />
      </aside>
    </>
  );
}
