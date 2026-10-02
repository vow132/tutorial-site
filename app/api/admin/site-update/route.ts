import { NextResponse } from "next/server";
import { getCurrentAdmin } from "@/lib/admin-auth";
import { getSiteUpdateStatus, startSiteUpdate } from "@/lib/site-update";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const headers = { "Cache-Control": "no-store, private" };

export async function GET() {
  if (!(await getCurrentAdmin())) {
    return NextResponse.json({ error: "登录已过期，请重新登录后台。" }, { status: 401, headers });
  }
  try { return NextResponse.json(await getSiteUpdateStatus(), { headers }); }
  catch { return NextResponse.json({ error: "无法读取更新状态，请检查服务器配置。" }, { status: 500, headers }); }
}

export async function POST(request: Request) {
  if (!(await getCurrentAdmin())) {
    return NextResponse.json({ error: "登录已过期，请重新登录后台。" }, { status: 401, headers });
  }
  // The browser sends JSON only from our own origin. Reject cross-site posts
  // even when a signed administrator cookie accompanies the request.
  const origin = request.headers.get("origin");
  const host = request.headers.get("host");
  if (!origin || !host || !request.headers.get("content-type")?.startsWith("application/json")) {
    return NextResponse.json({ error: "无效的更新请求，请从后台点击更新。" }, { status: 403, headers });
  }
  try {
    if (new URL(origin).host !== host || request.headers.get("sec-fetch-site") === "cross-site") {
      return NextResponse.json({ error: "不允许跨站触发更新。" }, { status: 403, headers });
    }
  } catch { return NextResponse.json({ error: "无效的请求来源。" }, { status: 403, headers }); }
  try { return NextResponse.json(await startSiteUpdate(), { status: 202, headers }); }
  catch (error) {
    // Only user-oriented errors are exposed; command failures can contain
    // credentialed URLs or absolute paths, so keep those details on the server.
    const message = error instanceof Error && !error.message.startsWith("Command failed:") ? error.message : "无法启动更新，请检查服务器 Git 和 PM2 配置。";
    return NextResponse.json({ error: message }, { status: 409, headers });
  }
}
