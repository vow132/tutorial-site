/** 服务启动时执行一次（Next.js instrumentation 约定）。 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs" || process.env.NEXT_PHASE === "phase-production-build") return;

  // 还没有后台账号：在日志里打印安装地址和安装码（lib/setup-code.mjs），每次启动都提示，直到装好
  try {
    const { prisma } = await import("./lib/prisma");
    if ((await prisma.admin.count()) === 0) {
      const [{ setupHint }, { SITE_URL }] = await Promise.all([import("./lib/setup-code.mjs"), import("./lib/site-url")]);
      console.log(setupHint(SITE_URL));
    }
  } catch (error) {
    console.error("[setup] 检查后台账号失败：", error);
  }

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

  // 中文短词搜索索引：在后台补齐（第一次升级时要处理全部教程，不阻塞启动）
  const { syncSearchIndex } = await import("./lib/search-index");
  void syncSearchIndex().then((count) => count > 0 && console.log(`[search-index] 已为 ${count} 篇教程建立中文短词索引`));

  // 定时发布（开发环境也开，方便调试）
  const { startPublishTimer } = await import("./lib/scheduled-publish");
  startPublishTimer();

  // 备份检查只在生产服务里跑；开发热重载不需要。
  if (process.env.NODE_ENV !== "production") return;
  const { startBackupWatch } = await import("./lib/backup-watch");
  startBackupWatch();
}
