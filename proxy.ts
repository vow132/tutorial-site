import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { SESSION_COOKIE, verifySession } from "@/lib/session";

const LOOPBACK = /^(?:127\.\d+\.\d+\.\d+|::1|::ffff:127\.\d+\.\d+\.\d+)$/;

/**
 * 更新脚本只从本机 127.0.0.1 做健康检查。Next 会把 socket 地址填进缺失的
 * x-forwarded-for，所以要求整条转发链都是回环地址：经 Nginx 转发或从公网
 * 直连的请求都会带上真实客户端地址，拿不到版本号。
 */
function isLocalHealthCheck(request: NextRequest) {
  const host = request.headers.get("host")?.replace(/:\d+$/, "");
  const chain = (request.headers.get("x-forwarded-for") ?? "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  return (
    (host === "127.0.0.1" || host === "localhost" || host === "[::1]") &&
    !request.headers.has("x-real-ip") &&
    chain.length > 0 &&
    chain.every((address) => LOOPBACK.test(address))
  );
}

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (pathname.startsWith("/admin") && pathname !== "/admin/login") {
    const token = request.cookies.get(SESSION_COOKIE)?.value;
    if (!verifySession(token)) {
      const url = new URL("/admin/login", request.url);
      url.searchParams.set("from", pathname);
      return NextResponse.redirect(url);
    }
  }

  const response = NextResponse.next();
  // 运行版本只告诉本机的更新脚本，不对公网暴露（仓库公开，版本号会暴露补丁状态）。
  if (
    pathname === "/admin/login" &&
    process.env.SITE_BUILD_REVISION &&
    isLocalHealthCheck(request)
  ) {
    response.headers.set("x-site-revision", process.env.SITE_BUILD_REVISION);
  }
  return response;
}

export const config = {
  matcher: ["/admin/:path*"],
};
