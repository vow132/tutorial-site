import type { Metadata } from "next";
import Link from "next/link";
import { requireAdminPage } from "@/lib/admin-auth";
import { formatBytes, getMediaLibrary, referenceLabel } from "@/lib/media";
import { RECENT_UPLOAD_DAYS } from "@/lib/upload-refs.mjs";
import { CleanUnusedForm, CopyUrlButton, DeleteMediaButton } from "./media-actions";
import { getAdminI18n } from "@/lib/i18n/server";
import { rich } from "@/lib/i18n/rich";

export async function generateMetadata(): Promise<Metadata> {
  const { m } = await getAdminI18n();
  return { title: m.admin.media.metaTitle };
}
export const dynamic = "force-dynamic";

const DATE: Intl.DateTimeFormatOptions = { year: "numeric", month: "2-digit", day: "2-digit" };

/**
 * 图片库：上传过的所有图片（响应式小图并在原图里），每张显示被哪些教程、历史版本或设置引用。
 * 可以复制地址复用，没被引用的可以删除或一键清理（移到上传目录的 .trash/，和 npm run uploads:clean 同样的规则）。
 */
export default async function MediaPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; filter?: string; page?: string }>;
}) {
  await requireAdminPage("media");
  const i18n = await getAdminI18n();
  const { m, f, plural, date } = i18n;
  const t = m.admin.media;
  const formatDate = (value: Date) => date(value, DATE);
  const { q = "", filter, page } = await searchParams;
  const unusedOnly = filter === "unused";
  const library = await getMediaLibrary({ query: q, unusedOnly, page: Number(page) || 1 });
  const { stats } = library;
  const href = (patch: { filter?: string | null; page?: number }) => {
    const params = new URLSearchParams();
    const nextFilter = patch.filter === undefined ? filter : patch.filter;
    if (q) params.set("q", q);
    if (nextFilter) params.set("filter", nextFilter);
    if (patch.page && patch.page > 1) params.set("page", String(patch.page));
    const query = params.toString();
    return `/admin/media${query ? `?${query}` : ""}`;
  };
  const tab = (active: boolean) =>
    `rounded-full px-3.5 py-1.5 text-sm transition-colors ${active ? "bg-btn text-white" : "text-ink-2 hover:bg-paper hover:text-ink"}`;

  return (
    <div className="max-w-6xl">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-ink">{t.heading}</h1>
          <p className="mt-1 text-sm text-ink-3">
            {f(t.stats, { count: stats.count, bytes: formatBytes(stats.bytes), unused: stats.unusedCount, unusedBytes: formatBytes(stats.unusedBytes) })}
          </p>
        </div>
        <CleanUnusedForm count={stats.cleanableCount} size={formatBytes(stats.cleanableBytes)} />
      </div>
      <p className="mt-2 text-xs text-ink-3">
        {f(t.hint, { days: RECENT_UPLOAD_DAYS })}
      </p>

      <div className="mt-6 flex flex-wrap items-center gap-3">
        <nav aria-label={t.filter} className="flex gap-1">
          <Link href={href({ filter: null })} className={tab(!unusedOnly)} aria-current={!unusedOnly ? "page" : undefined}>
            {t.all}
          </Link>
          <Link href={href({ filter: "unused" })} className={tab(unusedOnly)} aria-current={unusedOnly ? "page" : undefined}>
            {t.unused}
          </Link>
        </nav>
        <form role="search" action="/admin/media" className="flex min-w-0 flex-1 gap-2 sm:max-w-xs">
          {unusedOnly && <input type="hidden" name="filter" value="unused" />}
          <label htmlFor="media-search" className="sr-only">
            {t.search}
          </label>
          <input
            id="media-search"
            name="q"
            defaultValue={q}
            placeholder={t.search}
            className="h-9 min-w-0 flex-1 rounded-xl border border-line bg-surface px-3 text-sm outline-none focus:border-accent"
          />
        </form>
      </div>

      {library.items.length === 0 ? (
        <p className="mt-10 rounded-3xl border border-line bg-surface py-16 text-center text-sm text-ink-3">
          {q ? t.noMatch : unusedOnly ? t.allUsed : t.empty}
        </p>
      ) : (
        <ul className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {library.items.map((item) => (
            <li key={item.name} className="flex flex-col overflow-hidden rounded-2xl border border-line bg-surface">
              {/* eslint-disable-next-line @next/next/no-img-element -- 上传目录的静态文件 */}
              <img src={item.preview} alt={item.name} loading="lazy" decoding="async" className="aspect-[4/3] w-full bg-paper object-cover" />
              <div className="flex flex-1 flex-col gap-1.5 p-3">
                <p className="truncate font-mono text-xs text-ink-2" title={item.name}>
                  {item.name}
                </p>
                <p className="text-xs text-ink-3">
                  {formatBytes(item.bytes)} · {formatDate(item.modifiedAt)}
                </p>
                {item.references.length ? (
                  <p className="text-xs text-ink-2">
                    {rich(t.usedIn, {
                      where: item.references[0].href ? (
                        <Link href={item.references[0].href} className="text-accent-ink hover:underline">
                          {referenceLabel(item.references[0], i18n)}
                        </Link>
                      ) : (
                        referenceLabel(item.references[0], i18n)
                      ),
                    })}
                    {item.references.length > 1 && <span className="text-ink-3">{plural(item.references.length, t.moreRefs)}</span>}
                  </p>
                ) : (
                  <p className="text-xs text-amber-600 dark:text-amber-400">{item.recent ? f(t.unusedRecent, { days: RECENT_UPLOAD_DAYS }) : t.unused}</p>
                )}
                <div className="mt-auto flex flex-wrap items-center gap-1.5 pt-1.5">
                  <CopyUrlButton url={item.url} />
                  {item.references.length === 0 && <DeleteMediaButton name={item.name} recent={item.recent} />}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}

      {library.pages > 1 && (
        <nav aria-label={t.pagination} className="mt-8 flex items-center justify-center gap-3 text-sm">
          {library.page > 1 ? (
            <Link href={href({ page: library.page - 1 })} className="rounded-full border border-line px-4 py-1.5 text-ink-2 hover:bg-paper">
              {t.prev}
            </Link>
          ) : (
            <span />
          )}
          <span className="text-ink-3 tabular-nums">
            {library.page} / {library.pages}
          </span>
          {library.page < library.pages && (
            <Link href={href({ page: library.page + 1 })} className="rounded-full border border-line px-4 py-1.5 text-ink-2 hover:bg-paper">
              {t.next}
            </Link>
          )}
        </nav>
      )}
    </div>
  );
}
