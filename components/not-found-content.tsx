import IntentLink from "./intent-link";
import Mascot from "@/components/mascot";
import { getPublishedTutorialPage } from "@/lib/public-data";
import { getSiteI18n } from "@/lib/i18n/server";

async function latestTutorials() {
  try {
    return (await getPublishedTutorialPage({ page: 1, pageSize: 5 })).tutorials;
  } catch {
    // 数据库不可用时 404 页面照常显示
    return [];
  }
}

/**
 * 404 主体内容，供根级与 (site) 路由组的 not-found 共用
 * （两者外层布局不同：前者无站点导航，后者带页眉页脚）。
 * 给出搜索框和最新教程，让访客从失效链接进来也能继续找内容。
 */
export default async function NotFoundContent() {
  const [latest, { m }] = await Promise.all([latestTutorials(), getSiteI18n()]);
  const t = m.site.notFound;
  return (
    <div className="mx-auto flex max-w-lg flex-col items-center px-4 py-24 text-center">
      <Mascot />
      <h1 className="mt-8 text-6xl font-extrabold text-ink">404</h1>
      <p className="mt-4 text-ink-2">{t.message}</p>

      <form action="/search" method="get" role="search" className="mt-8 flex w-full gap-2">
        <label htmlFor="not-found-search" className="sr-only">
          {t.searchLabel}
        </label>
        <input
          id="not-found-search"
          name="q"
          type="search"
          enterKeyHint="search"
          placeholder={t.placeholder}
          className="h-11 min-w-0 flex-1 rounded-full border border-line bg-surface px-5 text-sm text-ink outline-none transition-colors placeholder:text-ink-3 focus:border-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent/60"
        />
        <button
          type="submit"
          className="h-11 shrink-0 rounded-full bg-btn px-6 text-sm font-semibold text-white transition-transform hover:scale-105 active:scale-[0.98]"
        >
          {t.submit}
        </button>
      </form>

      {latest.length > 0 && (
        <div className="mt-10 w-full text-left">
          <h2 className="text-sm font-semibold text-ink-2">{t.latest}</h2>
          <ul className="mt-3 divide-y divide-line rounded-2xl border border-line bg-surface">
            {latest.map((tutorial) => (
              <li key={tutorial.id}>
                <IntentLink
                  href={`/tutorials/${tutorial.slug}`}
                  className="flex items-center justify-between gap-3 px-4 py-3 text-sm text-ink transition-colors hover:text-accent-ink"
                >
                  <span className="truncate">{tutorial.title}</span>
                  <span aria-hidden="true" className="text-ink-3">→</span>
                </IntentLink>
              </li>
            ))}
          </ul>
        </div>
      )}

      <IntentLink
        href="/"
        className="mt-8 text-sm font-medium text-accent-ink hover:underline"
      >
        {t.backHome}
      </IntentLink>
    </div>
  );
}
