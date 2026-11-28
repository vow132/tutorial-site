import type { Metadata } from "next";
import { redirect } from "next/navigation";
import Mascot from "@/components/mascot";
import { prisma } from "@/lib/prisma";
import { getSettings, isDefaultText } from "@/lib/settings";
import { setupCodeFrom } from "@/lib/setup-code.mjs";
import { I18nProvider } from "@/lib/i18n/client";
import { getSetupLocale, i18nFor } from "@/lib/i18n/server";
import { rich } from "@/lib/i18n/rich";
import SetupForm from "./setup-form";

export async function generateMetadata(): Promise<Metadata> {
  const { m } = i18nFor(await getSetupLocale());
  return { title: m.admin.setup.metaTitle };
}
export const dynamic = "force-dynamic";

/**
 * 首次安装：还没有任何后台账号时，设置站名并创建站长账号（安装码校验见 lib/actions/setup.ts）。
 * 已经有账号时这个页面关闭，直接去登录页。
 */
export default async function SetupPage() {
  if ((await prisma.admin.count()) > 0) redirect("/admin/login");
  const settings = await getSettings();
  const ready = setupCodeFrom() !== null;
  // 还没设过网站语言：按浏览器语言（或刚选的语言）显示，并预选成网站语言
  const locale = await getSetupLocale();
  const { m } = i18nFor(locale);
  const t = m.admin.setup;

  return (
    <I18nProvider locale={locale} messages={{ common: m.common, reader: m.reader, admin: m.admin }}>
    <div lang={locale} className="mx-auto flex max-w-md flex-col items-center px-4 pb-24 pt-16">
      <Mascot />
      <div className="mt-6 w-full rounded-3xl border border-line bg-surface p-8 shadow-lifted">
        <h1 className="text-xl font-bold text-ink">{t.heading}</h1>
        <p className="mt-1 text-sm text-ink-3">{t.intro}</p>
        {ready ? (
          // 站点名称还是某种语言的默认值时，换成所选语言的默认站名
          <SetupForm locale={locale} defaultSiteName={isDefaultText("siteName", settings.siteName) ? m.defaults.siteName : settings.siteName} />
        ) : (
          <p role="alert" className="mt-6 rounded-xl bg-amber-500/10 px-4 py-3 text-sm leading-relaxed text-amber-700 dark:text-amber-300">
            {rich(t.noSecret, { authSecret: <code>AUTH_SECRET</code> })}{" "}
            {rich(t.noSecretFix, { env: <code>.env</code>, command: <code>openssl rand -base64 48</code> })}
          </p>
        )}
      </div>
    </div>
    </I18nProvider>
  );
}
