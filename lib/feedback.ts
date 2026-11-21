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
