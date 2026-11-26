import { prisma } from "@/lib/prisma";
import { recentDays } from "@/lib/site-day";

/** 仪表盘统计（只在后台用）。数据来自 TutorialDailyView，由 lib/view-counter.ts 写入。 */

export type DailyViews = { day: string; views: number };

/** 最近 n 天全站每天的阅读量，没有阅读的日子补 0。 */
export async function getViewTrend(days = 30): Promise<DailyViews[]> {
  const list = recentDays(days);
  const rows = await prisma.tutorialDailyView.groupBy({
    by: ["day"],
    where: { day: { gte: list[0] } },
    _sum: { views: true },
  });
  const byDay = new Map(rows.map((row) => [row.day, row._sum.views ?? 0]));
  return list.map((day) => ({ day, views: byDay.get(day) ?? 0 }));
}

export type TopTutorial = {
  id: number;
  title: string;
  slug: string;
  published: boolean;
  /** 作者（仪表盘据此判断能不能点进编辑页） */
  authorId: number | null;
  recentViews: number;
  /** 最近 n 天读到末尾的次数 */
  recentReads: number;
  totalViews: number;
  helpfulYes: number;
  helpfulNo: number;
};

/** 最近 n 天阅读最多的教程。 */
export async function getTopTutorials(days = 30, limit = 10): Promise<TopTutorial[]> {
  const [from] = recentDays(days);
  const rows = await prisma.tutorialDailyView.groupBy({
    by: ["tutorialId"],
    where: { day: { gte: from } },
    _sum: { views: true, completions: true },
    orderBy: { _sum: { views: "desc" } },
    take: limit,
  });
  if (rows.length === 0) return [];
  const tutorials = await prisma.tutorial.findMany({
    where: { id: { in: rows.map((row) => row.tutorialId) } },
    select: { id: true, title: true, slug: true, published: true, authorId: true, views: true, helpfulYes: true, helpfulNo: true },
  });
  const byId = new Map(tutorials.map((tutorial) => [tutorial.id, tutorial]));
  return rows.flatMap((row) => {
    const tutorial = byId.get(row.tutorialId);
    if (!tutorial) return [];
    const { views, ...rest } = tutorial;
    return [{ ...rest, totalViews: views, recentViews: row._sum.views ?? 0, recentReads: row._sum.completions ?? 0 }];
  });
}

export type TrafficSource = { source: string; views: number };

/** 最近 n 天的阅读来源（按次数降序）。 */
export async function getTrafficSources(days = 30): Promise<TrafficSource[]> {
  const [from] = recentDays(days);
  const rows = await prisma.referrerDaily.groupBy({
    by: ["source"],
    where: { day: { gte: from } },
    _sum: { views: true },
    orderBy: { _sum: { views: "desc" } },
  });
  return rows.map((row) => ({ source: row.source, views: row._sum.views ?? 0 }));
}
