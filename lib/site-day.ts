/**
 * 「每天」按北京时间划分（与文章页、后台显示的日期一致），格式 YYYY-MM-DD。
 * 只做日期换算，不碰数据库，阅读计数和单元测试都直接用。
 */
export const SITE_TIME_ZONE = "Asia/Shanghai";

const dayFormat = new Intl.DateTimeFormat("en-CA", {
  timeZone: SITE_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** 某个时刻在北京时间是哪一天。 */
export function siteDay(date = new Date()) {
  return dayFormat.format(date);
}

/** 截至 end 那天（含）的最近 n 天，旧的在前。按日历日推算，不受夏令时影响。 */
export function recentDays(n: number, end = new Date()) {
  const last = Date.parse(`${siteDay(end)}T00:00:00Z`);
  return Array.from({ length: n }, (_, index) =>
    new Date(last - (n - 1 - index) * 86_400_000).toISOString().slice(0, 10),
  );
}
