/**
 * 服务启动时执行一次（Next.js instrumentation 约定）。
 *
 * Next 会为每种运行时各编译一份这个文件。Node.js 专用的代码（数据库等）必须放在
 * `if (process.env.NEXT_RUNTIME === "nodejs")` 分支里再动态导入（Next 文档的写法）：
 * 编译 edge 版本时这个条件是常量 false，整个分支会被剔除。写成「不是 nodejs 就提前 return」的话，
 * 开发模式不会剔除后面的代码，edge 编译会去解析 better-sqlite3，`npm run dev` 的所有页面都会 500。
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    if (process.env.NEXT_PHASE === "phase-production-build") return;
    const { startServer } = await import("./lib/server-startup");
    await startServer();
  }
}
