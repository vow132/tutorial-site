import { requireAdminPage } from "@/lib/admin-auth";
import { versionLabel } from "@/lib/version";
import AdminSidebar from "./sidebar";
import DemoBanner from "@/components/demo-banner";
import DemoGuard from "@/components/demo-guard";
import { DEMO_READ_ONLY_MESSAGE, isDemoMode } from "@/lib/demo";

export default async function AdminPanelLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // 双保险：proxy 之外的二次校验（各页面内还会再校验一次）
  const admin = await requireAdminPage("dashboard");

  return (
    <>
      <DemoBanner area="admin" />
      {isDemoMode() && <DemoGuard message={DEMO_READ_ONLY_MESSAGE} />}
      <div className="mx-auto flex w-full max-w-7xl flex-1 flex-col gap-4 px-4 pt-[max(1rem,env(safe-area-inset-top))] md:flex-row md:gap-6 md:px-6 md:pt-6">
        <AdminSidebar version={versionLabel()} role={admin.role} />
        <div className="min-w-0 flex-1 pb-20">{children}</div>
      </div>
    </>
  );
}
