/** 「这篇有帮助吗」的统计展示（后台列表和仪表盘共用）。 */

/** 少于这么多票时比例没有参考价值，只显示票数。 */
export const MIN_VOTES_FOR_RATIO = 5;

export function helpfulSummary(yes: number, no: number) {
  const total = yes + no;
  if (total === 0) return { total, ratio: null, text: "暂无反馈" };
  if (total < MIN_VOTES_FOR_RATIO) return { total, ratio: null, text: `👍 ${yes} · 👎 ${no}` };
  const ratio = Math.round((yes / total) * 100);
  return { total, ratio, text: `${ratio}% 有帮助（${total} 票）` };
}

/** 读完率：读完次数 / 阅读次数（百分比）。阅读少于 minViews 次时没有参考价值，返回 null。 */
export function readRate(views: number, reads: number, minViews = 10) {
  if (views < minViews) return null;
  return Math.min(100, Math.round((reads / views) * 100));
}

export const MAX_FEEDBACK_MESSAGE = 500;

/** 读者留言规整：去掉控制字符（保留换行）、合并多余空行、去首尾空白。太短（少于 2 个字）返回 null。 */
export function cleanFeedbackMessage(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  // 不做 NFKC：会把中文全角标点（，！？）改成半角
  const text = raw
    .replace(/\r\n?/g, "\n")
    .replace(/[\u0000-\u0009\u000B-\u001F\u007F\u200B-\u200F\u202A-\u202E\u2066-\u2069]/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  if (Array.from(text).length < 2) return null;
  return Array.from(text).slice(0, MAX_FEEDBACK_MESSAGE).join("");
}
