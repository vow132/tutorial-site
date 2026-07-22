import type { Metadata } from "next";
import Link from "next/link";
import { prisma } from "@/lib/prisma";

export const metadata: Metadata = { title: "仪表盘" };

export const dynamic = "force-dynamic";

export default async function AdminDashboard() {
  const [tutorialCount, publishedCount, draftCount, categoryCount, viewAgg, recent] =
    await Promise.all([
      prisma.tutorial.count(),
      prisma.tutorial.count({ where: { published: true } }),
      prisma.tutorial.count({ where: { published: false } }),
      prisma.category.count(),
      prisma.tutorial.aggregate({ _sum: { views: true } }),
      prisma.tutorial.findMany({
        orderBy: { updatedAt: "desc" },
        take: 5,
        select: {
          id: true,
          title: true,
          published: true,
          updatedAt: true,
          category: { select: { name: true } },
        },
      }),
    ]);

  const stats = [
    { label: "教程总数", value: tutorialCount, color: "#6366f1" },
    { label: "已发布", value: publishedCount, color: "#10b981" },
    { label: "草稿", value: draftCount, color: "#f59e0b" },
    { label: "分类", value: categoryCount, color: "#0ea5e9" },
    { label: "总阅读量", value: viewAgg._sum.views ?? 0, color: "#ec4899" },
  ];

  return (
    <div>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-ink">仪表盘</h1>
          <p className="mt-1 text-sm text-ink-3">内容数据一览</p>
        </div>
        <Link
          href="/admin/tutorials/new"
          className="flex h-10 items-center gap-2 rounded-full bg-ink px-5 text-sm font-semibold text-white transition-opacity hover:opacity-90"
        >
          <svg width="13" height="13" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <path d="M7 1v12M1 7h12" />
          </svg>
          写教程
        </Link>
      </div>

      <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
        {stats.map((s) => (
          <div key={s.label} className="glow-card p-5">
            <p className="text-xs text-ink-2">{s.label}</p>
            <p className="mt-2 flex items-baseline gap-1.5">
              <span
                className="h-2 w-2 rounded-full"
                style={{ backgroundColor: s.color }}
              />
              <span className="text-2xl font-extrabold text-ink">{s.value}</span>
            </p>
          </div>
        ))}
      </div>

      <h2 className="mt-10 text-lg font-bold text-ink">最近更新</h2>
      <div className="mt-4 overflow-hidden rounded-3xl border border-line bg-white">
        {recent.length === 0 ? (
          <p className="py-16 text-center text-sm text-ink-3">
            还没有教程，点击右上角「写教程」开始创作
          </p>
        ) : (
          <ul className="divide-y divide-line">
            {recent.map((t) => (
              <li key={t.id}>
                <Link
                  href={`/admin/tutorials/${t.id}`}
                  className="flex items-center justify-between gap-4 px-6 py-4 transition-colors hover:bg-paper"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-ink">
                      {t.title}
                    </p>
                    <p className="mt-0.5 text-xs text-ink-3">
                      {t.category.name} · 更新于{" "}
                      {t.updatedAt.toLocaleDateString("zh-CN")}
                    </p>
                  </div>
                  <span
                    className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-medium ${
                      t.published
                        ? "bg-emerald-50 text-emerald-600"
                        : "bg-amber-50 text-amber-600"
                    }`}
                  >
                    {t.published ? "已发布" : "草稿"}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
