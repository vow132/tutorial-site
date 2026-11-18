import type { Metadata } from "next";
import Link from "next/link";
import { requireAdminPage } from "@/lib/admin-auth";
import { hasAboutContent, readAboutForAdmin } from "@/lib/about";
import { getSettings } from "@/lib/settings";
import AboutForm from "./about-form";

export const metadata: Metadata = { title: "关于页面" };
export const dynamic = "force-dynamic";

export default async function AdminAboutPage() {
  await requireAdminPage();
  const [about, settings] = await Promise.all([readAboutForAdmin(), getSettings()]);
  const linked = settings.footerColumns.some((column) => column.links.some((link) => link.href === "/about"));

  return (
    <div>
      <h1 className="text-2xl font-bold text-ink">关于页面</h1>
      <p className="mt-1 text-sm text-ink-3">
        前台地址 /about。写清楚网站是谁在维护、内容怎么来的、怎么联系，读者和搜索引擎都更信任。
        {hasAboutContent(about) && (
          <>
            {" "}
            <Link href="/about" prefetch={false} target="_blank" className="text-accent-ink hover:underline">
              查看前台页面 →
            </Link>
          </>
        )}
      </p>
      {!linked && (
        <p className="mt-4 rounded-2xl border border-amber-500/30 bg-amber-500/10 px-5 py-3 text-sm text-amber-800 dark:text-amber-200">
          页脚还没有指向关于页面的链接：到「站点设置 → 底部栏目」里添加一个链接，地址填 <code>/about</code>。
        </p>
      )}
      <div className="mt-6">
        <AboutForm title={about.title} content={about.content} />
      </div>
    </div>
  );
}
