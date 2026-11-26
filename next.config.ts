import type { NextConfig } from "next";
import { execFileSync } from "node:child_process";
import { publicContentSecurityPolicy } from "./lib/csp.mjs";

function buildRevision() {
  try {
    return execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
  } catch {
    // Docker 镜像里没有 .git：构建镜像时用构建参数 BUILD_REVISION 传入提交号（有 Git 仓库时始终以 Git 为准）
    return /^[a-f0-9]{40}$/.test(process.env.BUILD_REVISION ?? "") ? process.env.BUILD_REVISION! : "";
  }
}

const nextConfig: NextConfig = {
  env: { SITE_BUILD_REVISION: buildRevision() },
  // Docker 镜像用 standalone 输出：只带网站运行用到的文件（scripts/docker-runtime.mjs 整理成镜像内容），
  // 镜像小一大半。PM2 部署照常用 next start，不能打开（standalone 下 next start 不可用）。
  output: process.env.BUILD_STANDALONE === "1" ? "standalone" : undefined,
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
    // 后台（/admin/*）的 CSP 由 proxy.ts 按请求生成（带 nonce，不允许内联脚本），这里只管前台，见 lib/csp.mjs
    const publicPages = "/((?!admin(?:/|$)).*)";
    const https = [{ type: "header" as const, key: "x-forwarded-proto", value: "https" }];
    return [
      {
        source: publicPages,
        headers: [{ key: "Content-Security-Policy", value: publicContentSecurityPolicy(false) }],
      },
      {
        source: "/(.*)",
        headers: [
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
        source: publicPages,
        has: https,
        headers: [{ key: "Content-Security-Policy", value: publicContentSecurityPolicy(true) }],
      },
      {
        source: "/(.*)",
        has: https,
        headers: [{ key: "Strict-Transport-Security", value: "max-age=31536000" }],
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
