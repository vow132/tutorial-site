import { NextResponse } from "next/server";
import { getCurrentAdmin } from "@/lib/admin-auth";
import { getMediaLibrary } from "@/lib/media";
import { can } from "@/lib/roles";
import { getAdminI18n } from "@/lib/i18n/server";

/**
 * 图片库列表（只读），给编辑器的「从图片库插入」用。按文件名搜索、分页。
 * 只读所以演示站也能用；删除、清理走 lib/actions/media.ts。
 */
export async function GET(request: Request) {
  const admin = await getCurrentAdmin();
  const { m } = await getAdminI18n();
  if (!admin) return NextResponse.json({ error: m.admin.sessionExpired }, { status: 401 });
  if (!can(admin.role, "media")) return NextResponse.json({ error: m.admin.forbidden }, { status: 403 });
  const params = new URL(request.url).searchParams;
  const library = await getMediaLibrary({ query: params.get("q") ?? "", page: Number(params.get("page")) || 1 });
  return NextResponse.json(
    {
      items: library.items.map((item) => ({ name: item.name, url: item.url, preview: item.preview })),
      page: library.page,
      pages: library.pages,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
