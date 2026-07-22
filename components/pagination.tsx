import Link from "next/link";

export default function Pagination({
  page,
  totalPages,
  basePath,
  query = {},
}: {
  page: number;
  totalPages: number;
  basePath: string;
  query?: Record<string, string>;
}) {
  if (totalPages <= 1) return null;

  const href = (p: number) => {
    const params = new URLSearchParams({ ...query, page: String(p) });
    return `${basePath}?${params.toString()}`;
  };

  const pages = Array.from({ length: totalPages }, (_, i) => i + 1).filter(
    (p) => p === 1 || p === totalPages || Math.abs(p - page) <= 2
  );

  return (
    <nav className="mt-12 flex items-center justify-center gap-2">
      {page > 1 && (
        <Link
          href={href(page - 1)}
          className="flex h-9 items-center rounded-full border border-line bg-white px-4 text-sm text-ink-2 transition-colors hover:border-accent hover:text-accent"
        >
          上一页
        </Link>
      )}
      {pages.map((p, idx) => {
        const prev = pages[idx - 1];
        return (
          <span key={p} className="flex items-center gap-2">
            {prev && p - prev > 1 && <span className="text-ink-3">…</span>}
            <Link
              href={href(p)}
              className={`flex h-9 w-9 items-center justify-center rounded-full text-sm font-medium transition-colors ${
                p === page
                  ? "bg-ink text-white"
                  : "border border-line bg-white text-ink-2 hover:border-accent hover:text-accent"
              }`}
            >
              {p}
            </Link>
          </span>
        );
      })}
      {page < totalPages && (
        <Link
          href={href(page + 1)}
          className="flex h-9 items-center rounded-full border border-line bg-white px-4 text-sm text-ink-2 transition-colors hover:border-accent hover:text-accent"
        >
          下一页
        </Link>
      )}
    </nav>
  );
}
