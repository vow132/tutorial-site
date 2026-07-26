import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["better-sqlite3", "@prisma/adapter-better-sqlite3"],
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
};

export default nextConfig;
