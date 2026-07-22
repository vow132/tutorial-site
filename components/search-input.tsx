export default function SearchInput() {
  return (
    <form
      action="/search"
      method="get"
      className="flex h-11 shrink-0 items-center gap-2 rounded-full border border-line bg-white/85 pl-4 pr-1.5 shadow-[0_8px_30px_-12px_rgba(23,24,28,0.18)] backdrop-blur-md"
    >
      <svg width="15" height="15" viewBox="0 0 15 15" fill="none" stroke="#9ca3af" strokeWidth="1.6" strokeLinecap="round">
        <circle cx="6.5" cy="6.5" r="4.5" />
        <path d="M10 10l3.5 3.5" />
      </svg>
      <input
        name="q"
        placeholder="搜索教程…"
        className="w-24 bg-transparent text-sm outline-none placeholder:text-ink-3 focus:w-40 transition-all sm:w-32"
      />
      <button
        type="submit"
        className="flex h-8 w-8 items-center justify-center rounded-full bg-ink text-white transition-transform hover:scale-105"
        aria-label="搜索"
      >
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
          <path d="M1.5 6h9M7 2.5L10.5 6 7 9.5" />
        </svg>
      </button>
    </form>
  );
}