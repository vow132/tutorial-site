import Link from "next/link";
import Mascot from "@/components/mascot";

export default function SiteNotFound() {
  return (
    <div className="mx-auto flex max-w-lg flex-col items-center px-4 py-32 text-center">
      <Mascot />
      <h1 className="mt-8 text-6xl font-extrabold text-ink">404</h1>
      <p className="mt-4 text-ink-2">页面走丢了，要不回首页看看？</p>
      <Link
        href="/"
        className="mt-8 flex h-11 items-center rounded-full bg-ink px-6 text-sm font-semibold text-white transition-transform hover:scale-105"
      >
        返回首页
      </Link>
    </div>
  );
}
