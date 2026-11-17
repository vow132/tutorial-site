/** 服务启动时执行一次（Next.js instrumentation 约定）。 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs" || process.env.NEXT_PHASE === "phase-production-build") return;

  // 把数据库里还是明文（或用旧密钥加密）的敏感字段加密；失败不影响启动。
  try {
    const { resealSecrets } = await import("./lib/secret-migration");
    const count = await resealSecrets();
    if (count > 0) console.log(`[secret-box] 已加密 ${count} 项敏感数据`);
  } catch (error) {
    console.error("[secret-box] 加密敏感数据失败：", error);
  }

  // 旧文章补列表缩略图。
  try {
    const { backfillThumbnails } = await import("./lib/thumbnail-backfill");
    const count = await backfillThumbnails();
    if (count > 0) console.log(`[thumbnails] 已为 ${count} 篇教程生成列表缩略图`);
  } catch (error) {
    console.error("[thumbnails] 生成缩略图失败：", error);
  }

  // 定时任务只在生产服务里跑；开发热重载不需要。
  if (process.env.NODE_ENV !== "production") return;
  const { startBackupWatch } = await import("./lib/backup-watch");
  startBackupWatch();
}
