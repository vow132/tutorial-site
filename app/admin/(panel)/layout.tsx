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
    <div className="mx-auto flex max-w-7xl gap-6 px-4 pt-8">
      <AdminSidebar />
      <div className="min-w-0 flex-1 pb-20">{children}</div>
    </div>
  );
}
