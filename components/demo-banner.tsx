import { demoAccount, isDemoMode } from "@/lib/demo";
import { SITE_REPOSITORY_URL } from "@/lib/site-update-types";

/** 演示模式（lib/demo.ts）下页面顶部的一行说明：前台告诉访客后台账号，后台提醒只能看。 */
export default function DemoBanner({ area }: { area: "site" | "admin" }) {
  if (!isDemoMode()) return null;
  const account = demoAccount();
  return (
    <div className="print-hide border-b border-accent/20 bg-accent-soft px-4 py-2 text-center text-xs leading-relaxed text-accent-ink">
      <strong className="font-semibold">这是演示站</strong>
      {area === "admin" ? (
        "：后台可以随便看，保存、上传、删除都不会生效。"
      ) : account ? (
        <>
          ：后台 <a href="/admin" className="font-semibold underline underline-offset-2">/admin</a>，账号 {account.username}，密码 {account.password}（只能看，不能改）。
        </>
      ) : (
        "，后台只能看、不能改。"
      )}{" "}
      <a href={SITE_REPOSITORY_URL} target="_blank" rel="noopener noreferrer" className="font-semibold underline underline-offset-2">
        获取源码，搭自己的教程网 →
      </a>
    </div>
  );
}
