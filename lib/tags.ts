/**
 * 教程标签的纯函数：名称规整、URL 别名、后台输入解析（编辑表单、Server Action、测试共用）。
 */
export const MAX_TAGS_PER_TUTORIAL = 8;
export const MAX_TAG_LENGTH = 24;
/** 标签页至少有这么多篇已发布教程才允许搜索引擎收录（避免大量单篇的薄内容页）。 */
export const MIN_INDEXABLE_TAG_TUTORIALS = 2;

/** 去掉首尾空白和开头的 #，合并连续空白。 */
export function normalizeTagName(input: string) {
  return input.replace(/^[#＃\s]+/, "").replace(/\s+/g, " ").trim();
}

/** URL 别名：C++ → c-plus-plus、C# → c-sharp、Node.js → node-js、前端 性能 → 前端-性能。 */
export function tagSlug(name: string) {
  return name
    .normalize("NFKC")
    .toLowerCase()
    .replace(/\+/g, "-plus-")
    .replace(/#/g, "-sharp-")
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 48)
    .replace(/-$/, "");
}

export const tagPath = (slug: string) => `/tags/${encodeURIComponent(slug)}`;

/**
 * 解析后台填写的标签（逗号、顿号、分号或换行分隔）。按别名去重，保留第一次出现的写法。
 */
export function parseTagNames(input: string): { names: string[] } | { error: string } {
  const names: string[] = [];
  const seen = new Set<string>();
  for (const part of input.split(/[,，、;；\n]+/)) {
    const name = normalizeTagName(part);
    if (!name) continue;
    if (Array.from(name).length > MAX_TAG_LENGTH) return { error: `标签「${name}」太长，最多 ${MAX_TAG_LENGTH} 个字` };
    const slug = tagSlug(name);
    if (!slug) return { error: `标签「${name}」需要包含文字或数字` };
    if (seen.has(slug)) continue;
    seen.add(slug);
    names.push(name);
  }
  if (names.length > MAX_TAGS_PER_TUTORIAL) return { error: `每篇教程最多 ${MAX_TAGS_PER_TUTORIAL} 个标签` };
  return { names };
}
