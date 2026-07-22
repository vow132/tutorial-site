import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { getSettings } from "@/lib/settings";
import CapsuleNav from "./capsule-nav";
import Mascot from "./mascot";
import SearchInput from "./search-input";

export default async function SiteHeader() {
  const [categories, settings] = await Promise.all([
    prisma.category.findMany({
      orderBy: { order: "asc" },
      take: 4,
    }),
    getSettings(),
  ]);

  const items = [
    { href: "/", label: "首页" },
    { href: "/tutorials", label: "全部教程" },
    ...categories.map((c) => ({
      href: `/categories/${c.slug}`,
      label: c.name,
    })),
  ];

  return (
    <header className="sticky top-4 z-50 mx-auto w-full max-w-6xl px-4">
      <div className="relative flex items-center justify-between gap-3">
        {/* Logo */}
        <Link
          href="/"
          className="flex h-11 shrink-0 items-center gap-2 rounded-full border border-line bg-white/85 px-4 shadow-[0_8px_30px_-12px_rgba(23,24,28,0.18)] backdrop-blur-md"
        >
          <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-accent text-xs font-bold text-white">
            {settings.logoText}
          </span>
          <span className="text-sm font-bold tracking-wide">{settings.siteName}</span>
        </Link>

        {/* 胶囊导航 + 吉祥物 */}
        <div className="relative">
          <Mascot className="absolute -top-9 left-6 z-10" />
          <CapsuleNav items={items} />
        </div>

        <SearchInput />
      </div>
    </header>
  );
}
