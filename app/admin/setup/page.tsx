import type { Metadata } from "next";
import { redirect } from "next/navigation";
import Mascot from "@/components/mascot";
import { prisma } from "@/lib/prisma";
import { getSettings } from "@/lib/settings";
import { setupCodeFrom } from "@/lib/setup-code.mjs";
import SetupForm from "./setup-form";

export const metadata: Metadata = { title: "安装" };
export const dynamic = "force-dynamic";

/**
 * 首次安装：还没有任何后台账号时，设置站名并创建站长账号（安装码校验见 lib/actions/setup.ts）。
 * 已经有账号时这个页面关闭，直接去登录页。
 */
export default async function SetupPage() {
  if ((await prisma.admin.count()) > 0) redirect("/admin/login");
  const settings = await getSettings();
  const ready = setupCodeFrom() !== null;

  return (
    <div className="mx-auto flex max-w-md flex-col items-center px-4 pb-24 pt-16">
      <Mascot />
      <div className="mt-6 w-full rounded-3xl border border-line bg-surface p-8 shadow-lifted">
        <h1 className="text-xl font-bold text-ink">欢迎！先完成安装</h1>
        <p className="mt-1 text-sm text-ink-3">设置站点名称和站长账号，一分钟就好。其他内容（Logo、主题色、首页文案）装好后在后台改。</p>
        {ready ? (
          <SetupForm defaultSiteName={settings.siteName} />
        ) : (
          <p role="alert" className="mt-6 rounded-xl bg-amber-500/10 px-4 py-3 text-sm leading-relaxed text-amber-700 dark:text-amber-300">
            服务器的 <code>AUTH_SECRET</code> 还没有设置（或者还是 .env.example 里的占位值），现在不能安装。
            请在 <code>.env</code> 里换成 <code>openssl rand -base64 48</code> 生成的随机字符串，重启网站后刷新这个页面。
          </p>
        )}
      </div>
    </div>
  );
}
