export default function ThemeToggle() {
  return (
    <button
      type="button"
      data-theme-toggle
      aria-label="切换主题"
      title="切换主题"
      className="theme-toggle flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-line bg-white/90 text-ink-2 shadow-[0_8px_30px_-12px_rgba(23,24,28,0.18)] backdrop-blur-md transition-colors hover:bg-paper hover:text-ink"
    >
      <svg
        data-theme-icon="moon"
        width="18"
        height="18"
        viewBox="0 0 18 18"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M15.3 11.8A6.6 6.6 0 0 1 6.2 2.7 6.7 6.7 0 1 0 15.3 11.8Z" />
      </svg>
      <svg
        data-theme-icon="sun"
        width="18"
        height="18"
        viewBox="0 0 18 18"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <circle cx="9" cy="9" r="3.2" />
        <path d="M9 1.5v1.4M9 15.1v1.4M1.5 9h1.4M15.1 9h1.4M3.7 3.7l1 1M13.3 13.3l1 1M14.3 3.7l-1 1M4.7 13.3l-1 1" />
      </svg>
    </button>
  );
}
