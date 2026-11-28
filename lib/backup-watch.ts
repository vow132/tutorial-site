import { alertSite, getAlertConfig, getAlertStatus, notifyNow, updateAlertStatus } from "@/lib/alerts";
import { format } from "@/lib/i18n/format";
import { INTL_LOCALE } from "@/lib/i18n/locales";
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
  // 定时器在请求之外：网站语言直接读库（alertSite()），不能用依赖 Next 缓存的 getSettings()
  const { locale, m } = await alertSite();
  const t = m.admin.alerts;
  const latest = backup.latest
    ? format(t.latestBackup, { time: backup.latest.at.toLocaleString(INTL_LOCALE[locale], { hour12: false }), name: backup.latest.name })
    : t.noBackup;
  await notifyNow("backup.stale", t.titles.backupStale, [latest, format(t.backupDir, { dir: backup.directory }), t.backupHint]).catch(() => {});
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
