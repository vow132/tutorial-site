import type { NextConfig } from "next";
import { execFileSync } from "node:child_process";

function buildRevision() {
  try {
    return execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
  } catch { return ""; }
}

const isDev = process.env.NODE_ENV === "development";

/**
 * Next 的内联 RSC 脚本和主题初始化脚本需要 'unsafe-inline'（nonce 方案会让
 * 所有页面变成动态渲染）。正文 HTML 已在服务端按白名单过滤，CSP 在此之上
 * 再禁止外部脚本、插件、<base> 劫持、表单外发和被其他站点嵌入。
 */
function contentSecurityPolicy(upgradeInsecureRequests: boolean) {
  return [
    "default-src 'self'",
    `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
    "style-src 'self' 'unsafe-inline'",
    // 正文里可能引用外站 http 图片；HTTPS 下浏览器会自动升级，不构成脚本风险。
    "img-src 'self' data: blob: https: http:",
    "font-src 'self' data:",
    `connect-src 'self'${isDev ? " ws: wss:" : ""}`,
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    ...(upgradeInsecureRequests ? ["upgrade-insecure-requests"] : []),
  ].join("; ");
}

const nextConfig: NextConfig = {
  env: { SITE_BUILD_REVISION: buildRevision() },
  serverExternalPackages: ["better-sqlite3", "@prisma/adapter-better-sqlite3"],
  poweredByHeader: false,
  // 项目不使用 next/image；关闭后 /_next/image 直接 404，少一个可被攻击的图片处理入口。
  images: { unoptimized: true },
  turbopack: {
    root: process.cwd(),
  },
  /*
   * 开发环境默认只信任 localhost，从 127.0.0.1 或局域网 IP 打开时 Next 会拦掉
   * /_next/ 下的客户端资源，页面能渲染但不会 hydration —— 表现为导航箭头之类
   * 依赖 React state 的交互「点不动」。这里放行本机与内网常见网段，方便用
   * 手机或另一台机器调试。
   */
  allowedDevOrigins: [
    "127.0.0.1",
    "localhost",
    "*.local",
    "10.*.*.*",
    "172.16.*.*",
    "192.168.*.*",
    "26.*.*.*",
  ],
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "Content-Security-Policy", value: contentSecurityPolicy(false) },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()",
          },
        ],
      },
      {
        // 只有经 HTTPS 反向代理（会设置 X-Forwarded-Proto: https）访问时才启用
        // HSTS 与自动升级，直接 http://IP:3000 访问的部署不受影响。
        source: "/(.*)",
        has: [{ type: "header", key: "x-forwarded-proto", value: "https" }],
        headers: [
          { key: "Content-Security-Policy", value: contentSecurityPolicy(true) },
          { key: "Strict-Transport-Security", value: "max-age=31536000" },
        ],
      },
      {
        // 上传文件即使被直接打开也不能执行任何脚本；文件名含随机串、永不覆盖，可长期缓存。
        source: "/uploads/:path*",
        headers: [
          {
            key: "Content-Security-Policy",
            value: "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; sandbox",
          },
          { key: "Cache-Control", value: "public, max-age=31536000, immutable" },
        ],
      },
    ];
  },
};

export default nextConfig;
