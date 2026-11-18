import { prisma } from "@/lib/prisma";

/**
 * 健康检查：给 Uptime Kuma、宝塔监控、云监控等用，服务或数据库出问题时返回 503。
 * 只回答「能不能用」，不暴露版本号等信息。每次都实时检查，不缓存。
 */
export async function GET() {
  const headers = { "Cache-Control": "no-store" };
  try {
    await prisma.$queryRaw`SELECT 1`;
    return Response.json({ status: "ok", database: "ok" }, { headers });
  } catch {
    return Response.json({ status: "error", database: "unreachable" }, { status: 503, headers });
  }
}
