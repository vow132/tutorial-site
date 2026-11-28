import PointerAura from "@/components/pointer-aura";
import SiteFooter from "@/components/site-footer";
import SiteHeader from "@/components/site-header";
import DemoBanner from "@/components/demo-banner";
import { getReaderI18n } from "@/lib/i18n/reader-server";
import type { Locale } from "@/lib/i18n/locales";

/** 前台页面的外框：跳到正文、演示站横幅、顶栏、页脚、指针动效 */
export default async function SiteFrame({ siteLocale, children }: { siteLocale: Locale; children: React.ReactNode }) {
  const { m } = await getReaderI18n();
  return (
    <div className="flex min-h-screen flex-col [min-height:100dvh]">
      <a
        href="#main"
        className="skip-link fixed left-4 top-4 z-[100] rounded-full bg-btn px-5 py-2.5 text-sm font-semibold text-white shadow-lifted"
      >
        {m.site.skipToContent}
      </a>
      <DemoBanner area="site" m={m} />
      <SiteHeader siteLocale={siteLocale} />
      <main id="main" className="flex-1">
        {children}
      </main>
      <SiteFooter />
      <PointerAura />
    </div>
  );
}
