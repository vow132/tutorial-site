import { readdir, stat } from "node:fs/promises";
import path from "node:path";

/** scripts/backup.mjs 生成的文件名（设置了 BACKUP_PASSPHRASE 时带 .enc）。 */
const BACKUP_FILE = /^tutorial-\d{8}-\d{6}\.db\.gz(\.enc)?$/;

/** 超过这么久没有新备份就算「过期」。 */
export const BACKUP_STALE_MS = 48 * 60 * 60 * 1000;
/** 过期提醒每天最多一次。 */
export const BACKUP_REMINDER_INTERVAL_MS = 24 * 60 * 60 * 1000;

/**
 * 备份目录：与 scripts/backup.mjs 相同的规则。一键更新后网站运行在
 * .updates/releases/<版本> 里，相对路径要以原项目目录（SITE_UPDATE_ROOT）为准。
 */
export function backupDirectory() {
  const root = process.env.SITE_UPDATE_ROOT || process.cwd();
  return path.resolve(root, process.env.BACKUP_DIR || "backups");
}

export type BackupStatus = {
  directory: string;
  count: number;
  latest: { name: string; at: Date; size: number } | null;
};

export async function getBackupStatus(): Promise<BackupStatus> {
  const directory = backupDirectory();
  const names = (await readdir(directory).catch(() => [] as string[])).filter((name) => BACKUP_FILE.test(name));
  if (names.length === 0) return { directory, count: 0, latest: null };
  // 文件名带时间戳，按名称排序即按时间排序。
  const name = names.sort().at(-1)!;
  const info = await stat(path.join(directory, name)).catch(() => null);
  return {
    directory,
    count: names.length,
    latest: info ? { name, at: info.mtime, size: info.size } : null,
  };
}

/** 是否该发「备份过期」提醒：备份过期，且距上次提醒已超过一天。 */
export function shouldRemindBackup({
  latestAt,
  lastReminderAt,
  now = Date.now(),
}: {
  latestAt: Date | null;
  lastReminderAt?: string;
  now?: number;
}) {
  const stale = !latestAt || now - latestAt.getTime() >= BACKUP_STALE_MS;
  const remindedRecently =
    lastReminderAt !== undefined && now - Date.parse(lastReminderAt) < BACKUP_REMINDER_INTERVAL_MS;
  return stale && !remindedRecently;
}

function formatAge(ms: number) {
  const minutes = Math.floor(ms / 60_000);
  if (minutes < 60) return `${Math.max(1, minutes)} 分钟前`;
  const hours = Math.floor(minutes / 60);
  if (hours < 48) return `${hours} 小时前`;
  return `${Math.floor(hours / 24)} 天前`;
}

/** 仪表盘展示用：「3 小时前（1.2 MB，共保留 14 份）」以及是否已过期。 */
export function describeBackup(status: BackupStatus, now = Date.now()) {
  if (!status.latest) return { text: "还没有备份", stale: true };
  const age = now - status.latest.at.getTime();
  return {
    text: `${formatAge(age)}（${(status.latest.size / 1024 / 1024).toFixed(1)} MB${
      status.latest.name.endsWith(".enc") ? "，已加密" : ""
    }，共保留 ${status.count} 份）`,
    stale: age >= BACKUP_STALE_MS,
  };
}
