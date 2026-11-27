"use client";

import type { ReactNode } from "react";
import { useEffect, useId, useRef } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { logout } from "@/lib/actions/auth";
import ThemeToggle from "@/components/theme-toggle";
import LabelButton from "@/components/label-button";
import { SITE_REPOSITORY_URL } from "@/lib/site-update-types";
import { can, type Permission } from "@/lib/roles";
import LanguageSelect from "@/components/language-select";
import { useAdminI18n } from "@/lib/i18n/client";
import type { Messages } from "@/lib/i18n/messages/types";
import { rich } from "@/lib/i18n/rich";

type NavKey = keyof Omit<Messages["admin"]["nav"], "ariaLabel" | "viewSite" | "logout" | "changelog" | "version" | "openMenu" | "closeMenu" | "menu" | "title" | "language">;

type AdminItem = {
  href: string;
  /** 文字在字典 m.admin.nav 里的键 */
  label: NavKey;
  icon: ReactNode;
  /** 看得到这一项需要的权限（和页面里 requireAdminPage 的权限一致） */
  permission: Permission;
};

const items: AdminItem[] = [
  {
    href: "/admin",
    label: "dashboard",
    permission: "dashboard",
    icon: <path d="M3 3h7v7H3zM11 3h7v4h-7zM11 10h7v7h-7zM3 13h7v4H3z" />,
  },
  {
    href: "/admin/tutorials",
    label: "tutorials",
    permission: "tutorials",
    icon: <path d="M4 4.5A2.5 2.5 0 0 1 6.5 2H20v15.5H6.5A2.5 2.5 0 0 0 4 20zM4 17.5V4.5M20 17.5V20H6.5" />,
  },
  {
    href: "/admin/categories",
    label: "categories",
    permission: "taxonomy",
    icon: <path d="M3.5 3.5h6v6h-6zM11.5 3.5h6v6h-6zM3.5 11.5h6v6h-6zM11.5 11.5h6v6h-6z" />,
  },
  {
    href: "/admin/tags",
    label: "tags",
    permission: "taxonomy",
    icon: <path d="M3 3h7.5l8 8-7.5 7.5-8-8zM7 7h.01" />,
  },
  {
    href: "/admin/series",
    label: "series",
    permission: "taxonomy",
    icon: <path d="M4 4h11v3H4zM4 9.5h11v3H4zM4 15h11v3H4zM17.5 5.5v11" />,
  },
  {
    href: "/admin/media",
    label: "media",
    permission: "media",
    icon: <path d="M3 4h16v14H3zM3 14l4.5-4.5 4 4 2.5-2.5L19 16M14.5 8.5h.01" />,
  },
  {
    href: "/admin/feedback",
    label: "feedback",
    permission: "feedback",
    icon: <path d="M3.5 4.5h15v10h-9l-4 3.5v-3.5h-2zM7 8.5h8M7 11.5h5" />,
  },
  {
    href: "/admin/subscribers",
    label: "subscribers",
    permission: "site",
    icon: <path d="M3 5h16v12H3zM3 5l8 6.5L19 5" />,
  },
  {
    href: "/admin/about",
    label: "about",
    permission: "about",
    icon: (
      <>
        <circle cx="11" cy="11" r="8" />
        <path d="M11 10v5M11 7h.01" />
      </>
    ),
  },
  {
    href: "/admin/settings",
    label: "settings",
    permission: "site",
    icon: (
      <>
        <circle cx="11" cy="11" r="3" />
        <path d="M11 2.5v2.2M11 17.3v2.2M2.5 11h2.2M17.3 11h2.2M5 5l1.6 1.6M15.4 15.4L17 17M17 5l-1.6 1.6M6.6 15.4L5 17" />
      </>
    ),
  },
  {
    href: "/admin/users",
    label: "users",
    permission: "site",
    icon: (
      <>
        <circle cx="8" cy="7.5" r="3" />
        <path d="M2.5 18c.9-3 3-4.5 5.5-4.5s4.6 1.5 5.5 4.5M14 4.6a3 3 0 0 1 0 5.8M16 13.8c1.6.6 2.8 2 3.5 4.2" />
      </>
    ),
  },
  {
    href: "/admin/account",
    label: "account",
    permission: "account",
    icon: (
      <>
        <rect x="4" y="3" width="14" height="16" rx="2" />
        <circle cx="11" cy="8" r="2" />
        <path d="M7.5 15c.8-1.7 2-2.5 3.5-2.5s2.7.8 3.5 2.5" />
      </>
    ),
  },
  {
    href: "/admin/audit",
    label: "audit",
    permission: "site",
    icon: <path d="M11 2.5 4 5v5.5c0 4.2 3 7.4 7 9 4-1.6 7-4.8 7-9V5zM8 11l2 2 4-4" />,
  },
];

function isActivePath(pathname: string, href: string) {
  return href === "/admin" ? pathname === "/admin" : pathname.startsWith(href);
}

function SidebarLinks({
  pathname,
  version,
  role,
  onNavigate,
}: {
  pathname: string;
  version: string;
  role: string;
  onNavigate?: () => void;
}) {
  const { m, locale } = useAdminI18n();
  const t = m.admin.nav;
  return (
    <>
      <nav className="space-y-1" aria-label={t.ariaLabel}>
        {items.filter((item) => can(role, item.permission)).map((item) => (
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
              strokeWidth="1.6"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              {item.icon}
            </svg>
            {t[item.label]}
          </Link>
        ))}
      </nav>

      <div className="mt-3 space-y-1 border-t border-line pt-3">
        {/* 新标签页打开，不预取：后台页面每次加载都预取首页会触发首页重新生成，
            恰好和删除/修改教程同时发生时，可能把旧内容写进缓存。 */}
        <Link
          href="/"
          target="_blank"
          prefetch={false}
          onClick={onNavigate}
          className="flex items-center gap-3 rounded-2xl px-4 py-2.5 text-sm font-medium text-ink-2 transition-colors hover:bg-paper hover:text-ink"
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 22 22"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
            aria-hidden="true"
          >
            <path d="M9 4H4v14h14v-5M13 3h6v6M19 3l-8 8" />
          </svg>
          {t.viewSite}
        </Link>
        {/* 演示模式下也能退出登录（components/demo-guard.tsx 放行带 data-demo-allow 的表单） */}
        <form action={logout} data-demo-allow="">
          <button
            type="submit"
            className="flex w-full items-center gap-3 rounded-2xl px-4 py-2.5 text-sm font-medium text-red-500 transition-colors hover:bg-red-500/10"
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 22 22"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
              aria-hidden="true"
            >
              <path d="M14 4h4v14h-4M10 7l-4 4 4 4M6 11h9" />
            </svg>
            {t.logout}
          </button>
        </form>
        <a
          href={`${SITE_REPOSITORY_URL}/blob/master/CHANGELOG.md`}
          target="_blank"
          rel="noopener noreferrer"
          className="block px-4 pt-2 text-xs text-ink-3 transition-colors hover:text-ink"
          title={t.changelog}
        >
          {rich(t.version, { version: <span className="admin-version font-mono">{version}</span> })}
        </a>
        <LanguageSelect value={locale} label={t.language} className="px-4 pt-2" />
      </div>
    </>
  );
}

export default function AdminSidebar({ version, role }: { version: string; role: string }) {
  const pathname = usePathname();
  const { m } = useAdminI18n();
  const t = m.admin.nav;
  const toggleId = useId();
  const drawerId = useId();
  const toggleRef = useRef<HTMLInputElement>(null);
  const triggerRef = useRef<HTMLSpanElement>(null);
  const shellRef = useRef<HTMLDivElement>(null);

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
        return;
      }
      // 焦点圈禁：抽屉打开时 Tab 循环限制在内
      if (event.key === "Tab" && toggleRef.current?.checked && shellRef.current) {
        const focusables = Array.from(
          shellRef.current.querySelectorAll<HTMLElement>(
            'a[href], button:not([disabled]), [tabindex="0"]',
          ),
        ).filter((el) => el.offsetParent !== null);
        if (focusables.length === 0) return;
        const first = focusables[0];
        const last = focusables[focusables.length - 1];
        const active = document.activeElement;
        const inside = active instanceof Node && shellRef.current.contains(active);
        if (event.shiftKey) {
          if (active === first || !inside) {
            event.preventDefault();
            last.focus();
          }
        } else if (active === last || !inside) {
          event.preventDefault();
          first.focus();
        }
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

        <div className="flex min-h-14 items-center justify-between gap-3 rounded-2xl border border-line bg-surface/90 py-2 pl-4 pr-2 shadow-capsule backdrop-blur-md">
          <div className="min-w-0">
            <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-ink-3">
              Admin Panel
            </p>
            <p className="truncate text-sm font-semibold text-ink">
              {t[currentItem.label]}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <ThemeToggle label={m.reader.theme.toggle} />
            <LabelButton
              ref={triggerRef}
              htmlFor={toggleId}
              tabIndex={0}
              aria-label={t.openMenu}
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
              strokeWidth="1.6"
              strokeLinecap="round"
              aria-hidden="true"
            >
              <path d="M2.5 5h13M2.5 9h13M2.5 13h13" />
            </svg>
            </LabelButton>
          </div>
        </div>

        <div
          ref={shellRef}
          className="admin-mobile-drawer-shell pointer-events-none fixed inset-0 z-[90] md:hidden"
        >
          <LabelButton
            htmlFor={toggleId}
            tabIndex={0}
            aria-label={t.closeMenu}
            className="admin-mobile-drawer-backdrop absolute inset-0 cursor-pointer bg-scrim/45 opacity-0 backdrop-blur-[2px] transition-opacity duration-300"
          />

          <aside
            id={drawerId}
            role="dialog"
            aria-modal="true"
            aria-label={t.menu}
            className="admin-mobile-drawer-panel absolute inset-y-0 left-0 flex w-[min(86vw,20rem)] flex-col border-r border-line bg-surface shadow-2xl transition-transform duration-300 ease-out"
          >
            <div className="flex items-center justify-between border-b border-line px-5 py-4 pt-[max(1rem,env(safe-area-inset-top))]">
              <div>
                <p className="text-xs font-medium uppercase tracking-[0.18em] text-ink-3">
                  Admin Panel
                </p>
                <p className="mt-1 text-lg font-bold text-ink">{t.title}</p>
              </div>
              <div className="flex items-center gap-2">
                <ThemeToggle label={m.reader.theme.toggle} />
                <LabelButton
                  htmlFor={toggleId}
                  tabIndex={0}
                  aria-label={t.closeMenu}
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
                  strokeWidth="1.6"
                  strokeLinecap="round"
                  aria-hidden="true"
                >
                  <path d="M4 4l10 10M14 4 4 14" />
                </svg>
                </LabelButton>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-3">
              <SidebarLinks
                pathname={pathname}
                role={role}
                version={version}
                onNavigate={() => closeMobileMenu()}
              />
            </div>
          </aside>
        </div>
      </div>

      <aside className="sticky top-6 hidden h-fit w-52 shrink-0 rounded-3xl border border-line bg-surface p-3 md:block">
        <div className="mb-3 flex items-center justify-between border-b border-line px-1 pb-3">
          <span className="text-sm font-semibold text-ink">{t.title}</span>
          <ThemeToggle label={m.reader.theme.toggle} />
        </div>
        <SidebarLinks pathname={pathname} version={version} role={role} />
      </aside>
    </>
  );
}
