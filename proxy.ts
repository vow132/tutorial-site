import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { adminContentSecurityPolicy } from "@/lib/csp.mjs";
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

  // 登录页和首次安装页（还没有任何账号时用，页面自己校验安装码）不需要登录
  if (pathname.startsWith("/admin") && pathname !== "/admin/login" && pathname !== "/admin/setup") {
    const token = request.cookies.get(SESSION_COOKIE)?.value;
    if (!verifySession(token)) {
      const url = new URL("/admin/login", request.url);
      url.searchParams.set("from", pathname);
      return NextResponse.redirect(url);
    }
  }

  // 后台的 CSP：每个请求一个新的 nonce，Next 渲染时从请求头里取出来加到自己的脚本上（lib/csp.mjs）。
  // 这里只验 Cookie 签名；会话是否被吊销、角色有没有权限，由每个页面、接口、Server Action 自己检查
  // （requireAdminPage / requireAuth / requireSession / getCurrentAdmin），lib/route-guards.test.ts 保证没有遗漏。
  const nonce = randomBytes(16).toString("base64");
  const csp = adminContentSecurityPolicy(nonce, request.headers.get("x-forwarded-proto") === "https");
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("content-security-policy", csp);
  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set("Content-Security-Policy", csp);
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
