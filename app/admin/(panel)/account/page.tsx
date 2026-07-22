import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentAdmin } from "@/lib/admin-auth";
import AccountForm from "./account-form";

export const metadata: Metadata = { title: "账号安全" };
export const dynamic = "force-dynamic";

export default async function AdminAccountPage() {
  const admin = await getCurrentAdmin();
  if (!admin) redirect("/admin/login");

  return (
    <div className="max-w-2xl">
      <h1 className="text-2xl font-bold text-ink">账号安全</h1>
      <p className="mt-1 text-sm text-ink-3">
        修改管理员用户名或密码，保存后当前浏览器会自动保持登录。
      </p>
      <div className="mt-6 rounded-3xl border border-line bg-white p-6 sm:p-8">
        <AccountForm username={admin.username} />
      </div>
    </div>
  );
}