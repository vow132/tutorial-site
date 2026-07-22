import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { SESSION_COOKIE, verifySession } from "@/lib/session";
import AdminSidebar from "./sidebar";

export default async function AdminPanelLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // 双保险：proxy 之外的二次校验
  const store = await cookies();
  if (!verifySession(store.get(SESSION_COOKIE)?.value)) {
    redirect("/admin/login");
  }

  return (
    <div className="mx-auto flex max-w-7xl gap-6 px-4 pt-8">
      <AdminSidebar />
      <div className="min-w-0 flex-1 pb-20">{children}</div>
    </div>
  );
}
