import type { Metadata } from "next";
import { requireAdminPage } from "@/lib/admin-auth";
import { getSettings } from "@/lib/settings";
import { prisma } from "@/lib/prisma";
import SettingsForm from "./settings-form";

export const metadata: Metadata = { title: "站点设置" };

export const dynamic = "force-dynamic";

export default async function AdminSettingsPage() {
  await requireAdminPage();
  const [settings, seriesRows] = await Promise.all([
    getSettings(),
    prisma.series.findMany({
      orderBy: { createdAt: "desc" },
      select: { slug: true, title: true, _count: { select: { tutorials: { where: { published: true } } } } },
    }),
  ]);
  const series = seriesRows.map((row) => ({ slug: row.slug, title: row.title, published: row._count.tutorials > 0 }));

  return (
    <div>
      <h1 className="text-2xl font-bold text-ink">站点设置</h1>
      <p className="mt-1 text-sm text-ink-3">
        网站名称、标题、首页文案与底部栏目，保存后前台即时生效
      </p>
      <div className="mt-6">
        <SettingsForm settings={settings} series={series} />
      </div>
    </div>
  );
}
