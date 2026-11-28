import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { adminContentSecurityPolicy } from "@/lib/csp.mjs";
import { DEFAULT_SEGMENT, isReaderPage, READER_LOCALE_COOKIE, readerRewritePath, readerSegment } from "@/lib/i18n/reader";
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
  if (pathname.startsWith("/admin")) return adminProxy(request);
  if (!isReaderPage(pathname)) return NextResponse.next();

  // 前台页面：按读者选的语言改写到 app/[lang] 下对应的那份（lib/i18n/reader.ts），浏览器里的网址不变。
  const segment = readerSegment(request.cookies.get(READER_LOCALE_COOKIE)?.value);
  const url = request.nextUrl.clone();
  url.pathname = readerRewritePath(segment, pathname);
  const response = NextResponse.rewrite(url);
  if (segment !== DEFAULT_SEGMENT) {
    // 同一个网址按 Cookie 给出不同语言，中间的缓存只按网址存的话，会把这个读者选的语言给到别人。
    // Next 会覆盖页面的 Vary 和 Cache-Control，所以用它不碰的头：Nginx 认 X-Accel-Expires（示例配置只忽略了
    // Cache-Control / Expires），Cloudflare 等 CDN 认 CDN-Cache-Control。网站语言那一份照常缓存。
    response.headers.set("X-Accel-Expires", "0");
    response.headers.set("CDN-Cache-Control", "no-store");
  }
  return response;
}

function adminProxy(request: NextRequest) {
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
  // 后台和前台页面都经过这里；接口、Next 自己的文件、上传图片、分享图等不经过（和 isReaderPage() 的排除列表一致）
  matcher: ["/((?!api/|_next/|uploads/|og/|brand/|comments/|\\.well-known/|favicon\\.ico|feed\\.xml|sitemap\\.xml|robots\\.txt|manifest\\.webmanifest|__).*)"],
};
