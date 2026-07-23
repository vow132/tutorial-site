import { redirect } from "next/navigation";
import { getCurrentAdmin } from "@/lib/admin-auth";
import AdminSidebar from "./sidebar";

export default async function AdminPanelLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // 双保险：proxy 之外的二次校验
  if (!(await getCurrentAdmin())) {
    redirect("/admin/login");
  }

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-1 flex-col gap-4 px-4 pt-[max(1rem,env(safe-area-inset-top))] md:flex-row md:gap-6 md:px-6 md:pt-6">
      <AdminSidebar />
      <div className="min-w-0 flex-1 pb-20">{children}</div>
    </div>
  );
}
