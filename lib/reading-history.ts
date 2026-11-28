/*
 * 读者在本浏览器里读完过哪些教程（「教程书」的阅读进度）。只存在 localStorage，不上传、不用注册。
 * 「读完」和阅读统计里的读完一样：正文末尾进入屏幕、在页面上停留满 10 秒（components/reading-progress.tsx）。
 */

export const READING_HISTORY_KEY = "tutorial-site-read";
/** 最多记这么多篇，超过时丢掉最早读的 */
export const READING_HISTORY_LIMIT = 2000;
/** 同一个标签页里记下新的一篇时发出（其他标签页靠 storage 事件） */
export const READING_HISTORY_EVENT = "tutorial-site:read";

/** 解析存储的值：只认正整数，去重，保持先后顺序。 */
export function parseReadingHistory(raw: string | null): number[] {
  if (!raw) return [];
  try {
    const value: unknown = JSON.parse(raw);
    if (!Array.isArray(value)) return [];
    return [...new Set(value.filter((id): id is number => Number.isSafeInteger(id) && id > 0))];
  } catch {
    return [];
  }
}

/** 追加一篇（已经有的挪到最后），超过上限时丢掉最早的。 */
export function addToReadingHistory(history: number[], id: number): number[] {
  return [...history.filter((item) => item !== id), id].slice(-READING_HISTORY_LIMIT);
}

export function markTutorialRead(id: number) {
  try {
    const next = addToReadingHistory(parseReadingHistory(localStorage.getItem(READING_HISTORY_KEY)), id);
    localStorage.setItem(READING_HISTORY_KEY, JSON.stringify(next));
    window.dispatchEvent(new Event(READING_HISTORY_EVENT));
  } catch {
    // 隐私模式等存储不可用时不记进度，不影响阅读
  }
}

/** 订阅阅读记录的变化（本标签页和其他标签页）。 */
export function subscribeReadingHistory(listener: () => void) {
  const onStorage = (event: StorageEvent) => {
    if (event.key === READING_HISTORY_KEY) listener();
  };
  window.addEventListener(READING_HISTORY_EVENT, listener);
  window.addEventListener("storage", onStorage);
  return () => {
    window.removeEventListener(READING_HISTORY_EVENT, listener);
    window.removeEventListener("storage", onStorage);
  };
}
