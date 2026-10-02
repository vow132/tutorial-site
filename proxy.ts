import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { SESSION_COOKIE, verifySession } from "@/lib/session";

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
  if (pathname === "/admin/login" && process.env.SITE_BUILD_REVISION) {
    response.headers.set("x-site-revision", process.env.SITE_BUILD_REVISION);
  }
  return response;
}

export const config = {
  matcher: ["/admin/:path*"],
};
