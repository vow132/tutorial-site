import Link from "next/link";
import { getSettings } from "@/lib/settings";
import { getPublicCategories } from "@/lib/public-data";
import CapsuleNav from "./capsule-nav";
import Mascot from "./mascot";
import SearchInput from "./search-input";

export default async function SiteHeader() {
  const [categories, settings] = await Promise.all([
    getPublicCategories(),
    getSettings(),
  ]);

  const items = [
    { href: "/", label: "首页" },
    { href: "/tutorials", label: "全部教程" },
    ...categories.slice(0, 4).map((c) => ({
      href: `/categories/${c.slug}`,
      label: c.name,
    })),
  ];

  return (
    <header className="sticky top-4 z-50 mx-auto w-full max-w-6xl px-4">
      <div className="relative flex items-center gap-2 sm:gap-3 lg:justify-between">
        {/* Logo */}
        <Link
          href="/"
          className="flex h-11 min-w-0 flex-1 items-center justify-center gap-2 rounded-full border border-line bg-white/85 px-2.5 shadow-[0_8px_30px_-12px_rgba(23,24,28,0.18)] backdrop-blur-md lg:flex-none lg:justify-start lg:px-4"
        >
          <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-accent text-xs font-bold text-white">
            {settings.logoText}
          </span>
          <span className="max-w-[46vw] truncate text-sm font-bold tracking-wide max-[359px]:hidden lg:max-w-none">
            {settings.siteName}
          </span>
        </Link>

        {/* 胶囊导航 + 吉祥物 */}
        <div className="relative order-first lg:order-none">
          <Mascot className="absolute -top-9 left-6 z-10 hidden lg:block" />
          <CapsuleNav items={items} />
        </div>

        <SearchInput />
      </div>
    </header>
  );
}
