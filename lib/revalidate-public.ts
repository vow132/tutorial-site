import { revalidatePath, revalidateTag } from "next/cache";
import { READER_SEGMENTS } from "@/lib/i18n/reader";
import { CACHE_TAGS } from "@/lib/public-data";
import { clearSearchCache } from "@/lib/search";
import { syncSearchIndex } from "@/lib/search-index";

/**
 * 刷新一个前台页面的缓存。前台页面按读者语言各缓存一份（proxy.ts 把 /x 改写到 /<段>/x，app/[lang]），
 * revalidatePath 要用改写后的路径，所以每一份都要刷新。path 是浏览器里的地址，例如 /tutorials/css-grid。
 */
export function revalidateSitePath(path: string) {
  for (const segment of READER_SEGMENTS) revalidatePath(path === "/" ? `/${segment}` : `/${segment}${path}`);
}

/** 刷新匹配某个路由的所有前台页面（所有语言），例如 revalidateSiteRoute("/tutorials/[slug]") */
export function revalidateSiteRoute(route: string) {
  revalidatePath(`/[lang]${route}`, "page");
}

/**
 * 教程变动后刷新前台缓存。文章页是 ISR 缓存页：改 slug 时旧地址、删除时原地址都要显式失效，
 * 否则在 revalidate 周期内还会继续返回旧内容。只能在请求里调用（Server Action / Route Handler）。
 */
export function revalidatePublic(...slugs: (string | null | undefined)[]) {
  revalidateTag(CACHE_TAGS.tutorials, { expire: 0 });
  revalidateTag(CACHE_TAGS.tags, { expire: 0 });
  clearSearchCache();
  // 中文短词索引由应用维护：在后台补上这次改动（完成后再清一次搜索缓存）
  void syncSearchIndex().then((count) => count > 0 && clearSearchCache());
  revalidateSitePath("/");
  revalidateSitePath("/tutorials");
  // 系列页列出系列里的已发布教程：教程发布/撤回/改标题都会影响，系列不多，全部失效即可
  revalidateSitePath("/series");
  revalidateSiteRoute("/series/[slug]");
  for (const slug of new Set(slugs.filter((item): item is string => Boolean(item)))) {
    // 中文 slug 的缓存键是编码后的路径；两种写法都失效一遍，确保命中。
    revalidateSitePath(`/tutorials/${slug}`);
    revalidateSitePath(`/tutorials/${encodeURIComponent(slug)}`);
  }
}
