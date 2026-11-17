import { getAlertConfig, getAlertStatus, notifyNow, updateAlertStatus } from "@/lib/alerts";
import { getBackupStatus, shouldRemindBackup } from "@/lib/backup-status";

const FIRST_CHECK_MS = 10 * 60 * 1000;
const CHECK_EVERY_MS = 6 * 60 * 60 * 1000;

/** 检查备份是否过期，需要时推送提醒（每天最多一次）。 */
export async function checkBackupFreshness(now = Date.now()) {
  const config = await getAlertConfig();
  if (config.channel === "off" || config.backupReminder === false) return false;
  const [backup, status] = await Promise.all([getBackupStatus(), getAlertStatus()]);
  if (!shouldRemindBackup({ latestAt: backup.latest?.at ?? null, lastReminderAt: status.backupReminderAt, now })) {
    return false;
  }
  await updateAlertStatus({ backupReminderAt: new Date(now).toISOString() });
  const latest = backup.latest
    ? `最近一次备份：${backup.latest.at.toLocaleString("zh-CN", { hour12: false })}（${backup.latest.name}）`
    : "还没有任何备份";
  await notifyNow("backup.stale", "超过 2 天没有新的数据库备份", [
    latest,
    `备份目录：${backup.directory}`,
    "请检查服务器 crontab 里的 npm run backup 是否还在执行，或在后台「账号安全 → 安全告警」关闭备份提醒。",
  ]).catch(() => {});
  return true;
}

const globalForWatch = globalThis as typeof globalThis & { __backupWatch?: boolean };

/** 由 instrumentation.ts 在服务启动时调用：启动 10 分钟后首次检查，之后每 6 小时一次。 */
export function startBackupWatch() {
  if (globalForWatch.__backupWatch) return;
  globalForWatch.__backupWatch = true;
  const run = () => void checkBackupFreshness().catch((error) => console.error("[backup-watch]", error));
  setTimeout(run, FIRST_CHECK_MS).unref();
  setInterval(run, CHECK_EVERY_MS).unref();
}
