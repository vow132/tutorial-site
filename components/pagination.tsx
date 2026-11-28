import IntentLink from "./intent-link";
import type { Messages } from "@/lib/i18n/messages";
import { format } from "@/lib/i18n/format";

/** 分页。文字由调用方传进来：前台是网站语言（m.site.pagination），后台是管理员的语言。 */
export default function Pagination({
  page,
  totalPages,
  basePath,
  query = {},
  labels,
}: {
  page: number;
  totalPages: number;
  basePath: string;
  query?: Record<string, string>;
  labels: Messages["site"]["pagination"];
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
    <nav aria-label={labels.nav} className="mt-12 flex items-center justify-center gap-2">
      {page > 1 && (
        <IntentLink
          href={href(page - 1)}
          className="flex h-9 items-center rounded-full border border-line bg-surface px-4 text-sm text-ink-2 transition-colors hover:border-accent hover:text-accent"
        >
          {labels.prev}
        </IntentLink>
      )}
      {pages.map((p, idx) => {
        const prev = pages[idx - 1];
        return (
          <span key={p} className="flex items-center gap-2">
            {prev && p - prev > 1 && <span className="text-ink-3" aria-hidden="true">…</span>}
            <IntentLink
              href={href(p)}
              aria-current={p === page ? "page" : undefined}
              aria-label={format(labels.page, { page: p })}
              className={`flex h-9 w-9 items-center justify-center rounded-full text-sm font-medium transition-colors ${
                p === page
                  ? "bg-btn text-white"
                  : "border border-line bg-surface text-ink-2 hover:border-accent hover:text-accent"
              }`}
            >
              {p}
            </IntentLink>
          </span>
        );
      })}
      {page < totalPages && (
        <IntentLink
          href={href(page + 1)}
          className="flex h-9 items-center rounded-full border border-line bg-surface px-4 text-sm text-ink-2 transition-colors hover:border-accent hover:text-accent"
        >
          {labels.next}
        </IntentLink>
      )}
    </nav>
  );
}
