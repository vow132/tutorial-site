/** 搜索词规整（统计用）：全角转半角、小写、合并空白、最多 100 字。「 Redis  缓存」和「redis 缓存」算同一个词。 */
export function normalizeSearchQuery(raw: string) {
  return raw.normalize("NFKC").toLowerCase().replace(/\s+/g, " ").trim().slice(0, 100);
}
