"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion } from "framer-motion";
import { useState } from "react";

export type NavItem = { href: string; label: string };

/**
 * 悬浮胶囊导航：激活项弹簧滑动 + 光晕 + 流光。
 */
export default function CapsuleNav({ items }: { items: NavItem[] }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  const isActive = (href: string) =>
    href === "/" ? pathname === "/" : pathname.startsWith(href);

  return (
    <>
      {/* 桌面端胶囊 */}
      <nav className="hidden items-center gap-1 rounded-full border border-line bg-white/85 p-1.5 shadow-[0_8px_30px_-12px_rgba(23,24,28,0.18)] backdrop-blur-md md:flex">
        {items.map((item) => {
          const active = isActive(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`relative rounded-full px-5 py-2 text-sm font-medium transition-colors ${
                active ? "text-ink" : "text-ink-2 hover:text-ink"
              }`}
            >
              {active && (
                <motion.span
                  layoutId="nav-pill"
                  className="absolute inset-0 overflow-hidden rounded-full bg-accent-soft"
                  transition={{ type: "spring", stiffness: 420, damping: 34 }}
                >
                  <span className="nav-aura absolute inset-0 rounded-full bg-accent/10 blur-[6px]" />
                  <span className="nav-shine absolute inset-y-0 w-1/3 bg-gradient-to-r from-transparent via-white/70 to-transparent" />
                </motion.span>
              )}
              <span className="relative z-10">{item.label}</span>
            </Link>
          );
        })}
      </nav>

      {/* 移动端汉堡 */}
      <button
        className="flex h-10 w-10 items-center justify-center rounded-full border border-line bg-white md:hidden"
        onClick={() => setOpen(!open)}
        aria-label="菜单"
      >
        <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
          {open ? (
            <>
              <path d="M4 4l10 10M14 4L4 14" />
            </>
          ) : (
            <>
              <path d="M2.5 5h13M2.5 9h13M2.5 13h13" />
            </>
          )}
        </svg>
      </button>

      {/* 移动端抽屉 */}
      {open && (
        <div className="absolute inset-x-4 top-full mt-3 rounded-2xl border border-line bg-white p-2 shadow-xl md:hidden">
          {items.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => setOpen(false)}
              className={`block rounded-xl px-4 py-2.5 text-sm font-medium ${
                isActive(item.href)
                  ? "bg-accent-soft text-ink"
                  : "text-ink-2 hover:bg-paper"
              }`}
            >
              {item.label}
            </Link>
          ))}
        </div>
      )}
    </>
  );
}
