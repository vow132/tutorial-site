import { demoAccount, isDemoMode } from "@/lib/demo";
import { SITE_REPOSITORY_URL } from "@/lib/site-update-types";
import type { Messages } from "@/lib/i18n/messages";
import { format } from "@/lib/i18n/format";
import { rich } from "@/lib/i18n/rich";

/** 演示模式（lib/demo.ts）下页面顶部的一行说明：前台告诉访客后台账号，后台提醒只能看。文案用调用方的语言。 */
export default function DemoBanner({ area, m }: { area: "site" | "admin"; m: Messages }) {
  if (!isDemoMode()) return null;
  const account = demoAccount();
  const t = m.site.demo;
  return (
    <div className="print-hide border-b border-accent/20 bg-accent-soft px-4 py-2 text-center text-xs leading-relaxed text-accent-ink">
      <strong className="font-semibold">{t.title}</strong>
      {area === "admin"
        ? t.noAccount
        : account
          ? rich(format(t.withAccount, { username: account.username, password: account.password }), {
              admin: (
                <a href="/admin" className="font-semibold underline underline-offset-2">
                  /admin
                </a>
              ),
            })
          : t.inAdmin}{" "}
      <a href={SITE_REPOSITORY_URL} target="_blank" rel="noopener noreferrer" className="font-semibold underline underline-offset-2">
        {t.getSource}
      </a>
    </div>
  );
}
