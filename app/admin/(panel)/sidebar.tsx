"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { logout } from "@/lib/actions/auth";

const items = [
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

export default function AdminSidebar() {
  const pathname = usePathname();

  const isActive = (href: string) =>
    href === "/admin" ? pathname === "/admin" : pathname.startsWith(href);

  return (
    <aside className="sticky top-24 hidden h-fit w-52 shrink-0 rounded-3xl border border-line bg-white p-3 md:block">
      <nav className="space-y-1">
        {items.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className={`flex items-center gap-3 rounded-2xl px-4 py-2.5 text-sm font-medium transition-colors ${
              isActive(item.href)
                ? "bg-accent-soft text-accent"
                : "text-ink-2 hover:bg-paper hover:text-ink"
            }`}
          >
            <svg width="16" height="16" viewBox="0 0 22 22" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round">
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
          className="flex items-center gap-3 rounded-2xl px-4 py-2.5 text-sm font-medium text-ink-2 transition-colors hover:bg-paper hover:text-ink"
        >
          <svg width="16" height="16" viewBox="0 0 22 22" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round">
            <path d="M9 4H4v14h14v-5M13 3h6v6M19 3l-8 8" />
          </svg>
          查看网站
        </Link>
        <form action={logout}>
          <button
            type="submit"
            className="flex w-full items-center gap-3 rounded-2xl px-4 py-2.5 text-sm font-medium text-red-500 transition-colors hover:bg-red-50"
          >
            <svg width="16" height="16" viewBox="0 0 22 22" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round">
              <path d="M14 4h4v14h-4M10 7l-4 4 4 4M6 11h9" />
            </svg>
            退出登录
          </button>
        </form>
      </div>
    </aside>
  );
}