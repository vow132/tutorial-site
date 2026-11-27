import type { Metadata } from "next";
import Link from "next/link";
import { requireAdminPage } from "@/lib/admin-auth";
import { can } from "@/lib/roles";
import { hasAboutContent, readAboutForAdmin } from "@/lib/about";
import { getSettings } from "@/lib/settings";
import AboutForm from "./about-form";
import { getAdminI18n, getSiteI18n } from "@/lib/i18n/server";
import { rich } from "@/lib/i18n/rich";

export async function generateMetadata(): Promise<Metadata> {
  const { m } = await getAdminI18n();
  return { title: m.admin.about.metaTitle };
}
export const dynamic = "force-dynamic";

export default async function AdminAboutPage() {
  const admin = await requireAdminPage("about");
  const t = (await getAdminI18n()).m.admin.about;
  // 没填标题时的默认标题跟网站语言（前台读者看到的）
  const [about, settings] = await Promise.all([readAboutForAdmin((await getSiteI18n()).m.defaults.aboutTitle), getSettings()]);
  const linked = settings.footerColumns.some((column) => column.links.some((link) => link.href === "/about"));

  return (
    <div>
      <h1 className="text-2xl font-bold text-ink">{t.heading}</h1>
      <p className="mt-1 text-sm text-ink-3">
        {t.intro}
        {hasAboutContent(about) && (
          <>
            {" "}
            <Link href="/about" prefetch={false} target="_blank" className="text-accent-ink hover:underline">
              {t.viewPage}
            </Link>
          </>
        )}
      </p>
      {!linked && (
        <p className="mt-4 rounded-2xl border border-amber-500/30 bg-amber-500/10 px-5 py-3 text-sm text-amber-800 dark:text-amber-200">
          {rich(t.notLinked, { path: <code>/about</code> })}
        </p>
      )}
      <div className="mt-6">
        <AboutForm title={about.title} content={about.content} mediaLibrary={can(admin.role, "media")} />
      </div>
    </div>
  );
}
