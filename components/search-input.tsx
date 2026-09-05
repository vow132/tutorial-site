import Link from "next/link";

export default function SearchInput() {
  return (
    <>
      {/* 小屏使用图标入口，避免窄屏输入框挤压 Logo。 */}
      <Link
        href="/search"
        aria-label="打开搜索"
        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-line bg-surface/90 text-ink-2 shadow-capsule backdrop-blur-md transition-colors hover:bg-paper hover:text-ink sm:hidden"
      >
        <svg width="17" height="17" viewBox="0 0 17 17" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
          <circle cx="7.25" cy="7.25" r="4.75" />
          <path d="m10.75 10.75 3.75 3.75" />
        </svg>
      </Link>

      <form
        action="/search"
        method="get"
        className="hidden h-11 shrink-0 items-center gap-2 rounded-full border border-line bg-surface/85 pl-4 pr-1.5 shadow-capsule backdrop-blur-md sm:flex"
      >
        <svg width="15" height="15" viewBox="0 0 15 15" fill="none" stroke="currentColor" className="text-ink-3" strokeWidth="1.6" strokeLinecap="round">
          <circle cx="6.5" cy="6.5" r="4.5" />
          <path d="M10 10l3.5 3.5" />
        </svg>
        <input
          name="q"
          placeholder="搜索教程…"
          className="w-24 bg-transparent text-sm outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent/60 transition-all placeholder:text-ink-3 focus:w-40 sm:w-32"
        />
        <button
          type="submit"
          className="flex h-8 w-8 items-center justify-center rounded-full bg-btn text-white transition-transform hover:scale-105"
          aria-label="搜索"
        >
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
            <path d="M1.5 6h9M7 2.5L10.5 6 7 9.5" />
          </svg>
        </button>
      </form>
    </>
  );
}
