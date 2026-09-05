import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentAdmin } from "@/lib/admin-auth";
import Mascot from "@/components/mascot";
import LoginForm from "./login-form";

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

  return (
    <div className="mx-auto flex max-w-sm flex-col items-center px-4 pb-24 pt-20">
      <Mascot />
      <div className="mt-6 w-full rounded-3xl border border-line bg-surface p-8 shadow-lifted">
        <div className="text-center">
          <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-accent text-lg font-bold text-white">
            教
          </span>
          <h1 className="mt-4 text-xl font-bold text-ink">管理后台</h1>
          <p className="mt-1 text-sm text-ink-3">登录以管理教程内容</p>
        </div>
        <LoginForm from={safeFrom} />
      </div>
    </div>
  );
}
