import { revalidatePath, revalidateTag } from "next/cache";
import { CACHE_TAGS } from "@/lib/public-data";
import { clearSearchCache } from "@/lib/search";
import { syncSearchIndex } from "@/lib/search-index";

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
  revalidatePath("/");
  revalidatePath("/tutorials");
  for (const slug of new Set(slugs.filter((item): item is string => Boolean(item)))) {
    // 中文 slug 的缓存键是编码后的路径；两种写法都失效一遍，确保命中。
    revalidatePath(`/tutorials/${slug}`);
    revalidatePath(`/tutorials/${encodeURIComponent(slug)}`);
  }
}
