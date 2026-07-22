import type { Metadata } from "next";
import { getSettings } from "@/lib/settings";
import SettingsForm from "./settings-form";

export const metadata: Metadata = { title: "站点设置" };

export const dynamic = "force-dynamic";

export default async function AdminSettingsPage() {
  const settings = await getSettings();

  return (
    <div>
      <h1 className="text-2xl font-bold text-ink">站点设置</h1>
      <p className="mt-1 text-sm text-ink-3">
        网站名称、标题、首页文案与底部栏目，保存后前台即时生效
      </p>
      <div className="mt-6">
        <SettingsForm settings={settings} />
      </div>
    </div>
  );
}
