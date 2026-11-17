/** 服务启动时执行一次（Next.js instrumentation 约定）。 */
export async function register() {
  // 只在 Node.js 生产服务里跑定时任务；开发热重载和构建阶段不需要。
  if (process.env.NEXT_RUNTIME !== "nodejs" || process.env.NODE_ENV !== "production") return;
  const { startBackupWatch } = await import("./lib/backup-watch");
  startBackupWatch();
}
