import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentAdmin } from "@/lib/admin-auth";
import { relyingParty } from "@/lib/passkeys";
import { prisma } from "@/lib/prisma";
import Mascot from "@/components/mascot";
import SiteLogo from "@/components/site-logo";
import { demoAccount } from "@/lib/demo";
import { getSettings } from "@/lib/settings";
import LoginForm from "./login-form";
import PasskeyLogin from "./passkey-login";

export const metadata: Metadata = { title: "管理员登录" };

export default async function AdminLoginPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string }>;
}) {
  const { from } = await searchParams;
  // 只接受站内 /admin 路径，login action 内会再做一次同样校验
  const safeFrom =
    from && /^\/admin(?:\/|$)/.test(from) && !from.startsWith("/admin//")
      ? from
      : undefined;

  if (await getCurrentAdmin()) {
    redirect(safeFrom ?? "/admin");
  }

  // 登记过通行密钥、且站点地址满足 WebAuthn 要求（HTTPS + 域名）时才显示通行密钥登录。
  const passkeyLogin = !("error" in relyingParty()) && (await prisma.adminPasskey.count()) > 0;
  const settings = await getSettings();
  const demo = demoAccount();

  return (
    <div className="mx-auto flex max-w-sm flex-col items-center px-4 pb-24 pt-20">
      <Mascot />
      <div className="mt-6 w-full rounded-3xl border border-line bg-surface p-8 shadow-lifted">
        <div className="text-center">
          <SiteLogo settings={settings} className="mx-auto h-12 w-12 rounded-2xl! text-lg" />
          <h1 className="mt-4 text-xl font-bold text-ink">管理后台</h1>
          <p className="mt-1 text-sm text-ink-3">登录以管理{settings.siteName}的内容</p>
        </div>
        {demo && (
          <p className="mt-5 rounded-2xl bg-accent-soft px-4 py-3 text-sm leading-relaxed text-accent-ink">
            这是演示站，账号 <strong>{demo.username}</strong>、密码 <strong>{demo.password}</strong> 已经帮你填好。后台可以随便看，保存不了修改。
          </p>
        )}
        <LoginForm from={safeFrom} initial={demo ?? undefined} />
        {passkeyLogin && <PasskeyLogin from={safeFrom} />}
      </div>
    </div>
  );
}
