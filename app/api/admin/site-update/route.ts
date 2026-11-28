import { NextResponse } from "next/server";
import { confirmCurrentPassword, getCurrentAdmin } from "@/lib/admin-auth";
import { audit } from "@/lib/audit";
import { isDemoMode } from "@/lib/demo";
import { getSiteUpdateStatus, startSiteUpdate, UpdateError } from "@/lib/site-update";
import { getAdminI18n } from "@/lib/i18n/server";
import { can } from "@/lib/roles";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const headers = { "Cache-Control": "no-store, private" };

export async function GET() {
  const viewer = await getCurrentAdmin();
  const { m } = await getAdminI18n();
  if (!viewer) {
    return NextResponse.json({ error: m.admin.sessionExpired }, { status: 401, headers });
  }
  // 一键更新只给站长（编辑、作者的仪表盘不显示这个入口）
  if (!can(viewer.role, "site")) return NextResponse.json({ error: m.admin.forbidden }, { status: 403, headers });
  try { return NextResponse.json(await getSiteUpdateStatus(), { headers }); }
  catch { return NextResponse.json({ error: m.admin.update.messages.statusFailed }, { status: 500, headers }); }
}

export async function POST(request: Request) {
  const admin = await getCurrentAdmin();
  const { m } = await getAdminI18n();
  const t = m.admin.update.messages;
  if (!admin) {
    return NextResponse.json({ error: m.admin.sessionExpired }, { status: 401, headers });
  }
  if (!can(admin.role, "site")) return NextResponse.json({ error: m.admin.forbidden }, { status: 403, headers });
  if (isDemoMode()) return NextResponse.json({ error: m.admin.demoReadOnly }, { status: 403, headers });
  // The browser sends JSON only from our own origin. Reject cross-site posts
  // even when a signed administrator cookie accompanies the request.
  const origin = request.headers.get("origin");
  const host = request.headers.get("host");
  if (!origin || !host || !request.headers.get("content-type")?.startsWith("application/json")) {
    return NextResponse.json({ error: t.badRequest }, { status: 403, headers });
  }
  try {
    if (new URL(origin).host !== host || request.headers.get("sec-fetch-site") === "cross-site") {
      return NextResponse.json({ error: t.crossSite }, { status: 403, headers });
    }
  } catch { return NextResponse.json({ error: t.badOrigin }, { status: 403, headers }); }
  // 部署会在服务器上执行新代码，属于高危操作：即使会话有效也要再输一次密码。
  let password = "";
  try {
    const body: unknown = await request.json();
    if (body && typeof body === "object" && typeof (body as { password?: unknown }).password === "string") {
      password = (body as { password: string }).password;
    }
  } catch { /* 按缺少密码处理 */ }
  const confirmError = await confirmCurrentPassword(admin, password);
  if (confirmError) {
    await audit("site-update.denied", { actor: admin.username, detail: confirmError });
    return NextResponse.json({ error: confirmError }, { status: 403, headers });
  }
  await audit("site-update.start", { actor: admin.username });
  try { return NextResponse.json(await startSiteUpdate(), { status: 202, headers }); }
  catch (error) {
    // Only user-oriented errors are exposed; command failures can contain
    // credentialed URLs or absolute paths, so keep those details on the server.
    const message =
      error instanceof UpdateError ? t[error.code]
      : error instanceof Error && !error.message.startsWith("Command failed:") ? error.message
      : t.startFailedServer;
    return NextResponse.json({ error: message }, { status: 409, headers });
  }
}
