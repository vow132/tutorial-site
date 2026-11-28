import type { Metadata } from "next";
import { requireAdminPage } from "@/lib/admin-auth";
import { getSettings } from "@/lib/settings";
import { prisma } from "@/lib/prisma";
import { loadTurnstile } from "@/lib/turnstile-store";
import SettingsForm from "./settings-form";
import TurnstileForm from "./turnstile-form";
import { getAdminI18n, getSiteI18n } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const { m } = await getAdminI18n();
  return { title: m.admin.settings.metaTitle };
}

export const dynamic = "force-dynamic";

export default async function AdminSettingsPage() {
  await requireAdminPage();
  const t = (await getAdminI18n()).m.admin.settings;
  const [settings, seriesRows, turnstile] = await Promise.all([
    getSettings(),
    prisma.series.findMany({
      orderBy: { createdAt: "desc" },
      select: { slug: true, title: true, _count: { select: { tutorials: { where: { published: true } } } } },
    }),
    loadTurnstile(),
  ]);
  const series = seriesRows.map((row) => ({ slug: row.slug, title: row.title, published: row._count.tutorials > 0 }));

  return (
    <div>
      <h1 className="text-2xl font-bold text-ink">{t.heading}</h1>
      <p className="mt-1 text-sm text-ink-3">{t.intro}</p>
      <div className="mt-6">
        <SettingsForm settings={settings} series={series} defaults={(await getSiteI18n()).m.defaults} />
      </div>
      {/* 人机验证单独保存：Secret Key 加密存在另一条设置里，开启前要先试一次（lib/actions/turnstile.ts） */}
      <section aria-labelledby="turnstile-heading" className="mt-6 rounded-3xl border border-line bg-surface p-6">
        <h2 id="turnstile-heading" className="text-base font-bold text-ink">
          {t.turnstileHeading}
        </h2>
        <div className="mt-4">
          <TurnstileForm
            initial={{
              enabled: turnstile.enabled,
              siteKey: turnstile.siteKey,
              hasSecret: Boolean(turnstile.secret) || turnstile.secretUnreadable,
              secretUnreadable: turnstile.secretUnreadable,
            }}
          />
        </div>
      </section>
    </div>
  );
}
