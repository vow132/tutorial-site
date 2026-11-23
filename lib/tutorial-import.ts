import { MAX_TAGS_PER_TUTORIAL, parseTagNames, tagSlug } from "@/lib/tags";

/** 批量导入用到的纯函数（服务端 Server Action 用，单元测试覆盖）。 */

/** 原来的标签逐个规整：太长、没有文字的跳过，同名（按别名）去重，最多 8 个。 */
export function cleanImportTags(names: unknown): string[] {
  const result: string[] = [];
  const seen = new Set<string>();
  for (const raw of Array.isArray(names) ? names : []) {
    if (typeof raw !== "string") continue;
    const parsed = parseTagNames(raw.replace(/[,，、;；\n]+/g, " "));
    if ("error" in parsed) continue;
    for (const name of parsed.names) {
      const slug = tagSlug(name);
      if (seen.has(slug)) continue;
      seen.add(slug);
      result.push(name);
    }
    if (result.length >= MAX_TAGS_PER_TUTORIAL) break;
  }
  return result.slice(0, MAX_TAGS_PER_TUTORIAL);
}

const toDate = (value: unknown) => {
  if (typeof value !== "string" || !value) return null;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date : null;
};

/**
 * 保留原来的发布和修改时间（文章列表按发布时间排序，搜索引擎看到的修改时间也不会都变成今天）。
 * 无效或晚于现在的发布时间用现在；修改时间不早于发布时间，没有时等于发布时间。
 */
export function importDates(created: unknown, updated: unknown, now = new Date()): { createdAt: Date; updatedAt: Date } {
  const parsedCreated = toDate(created);
  const createdAt = parsedCreated && parsedCreated <= now ? parsedCreated : now;
  const parsedUpdated = toDate(updated);
  const updatedAt = parsedUpdated && parsedUpdated >= createdAt && parsedUpdated <= now ? parsedUpdated : createdAt;
  return { createdAt, updatedAt };
}

/** slug 被占用时依次试 -2、-3……（保证总长不超过 80）。 */
export function slugCandidates(base: string, count = 50): string[] {
  const list = [base];
  for (let n = 2; n <= count; n++) {
    const suffix = `-${n}`;
    list.push(`${base.slice(0, 80 - suffix.length).replace(/-+$/, "")}${suffix}`);
  }
  return list;
}
