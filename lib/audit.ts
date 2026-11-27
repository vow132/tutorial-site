import { prisma } from "@/lib/prisma";
import { alertForAudit, alertSite, notifyInBackground } from "@/lib/alerts";
import { getClientIp, getUserAgent } from "@/lib/client-ip";

const RETENTION_DAYS = 365;
const PRUNE_EVERY = 200;
let writesSincePrune = 0;

/**
 * 记录一条后台安全审计日志。写日志失败不能影响业务本身，所以吞掉异常，
 * 只打印到服务器日志。
 */
export async function audit(
  action: string,
  /** alert：按情况决定要不要推送的动作（新设备登录、改了角色）由调用方指明 */
  options: { actor?: string | null; detail?: string | null; alert?: boolean } = {},
) {
  try {
    const ip = await getClientIp();
    await prisma.auditLog.create({
      data: {
        action,
        actor: options.actor?.slice(0, 64) ?? null,
        ip,
        detail: options.detail?.slice(0, 500) ?? null,
      },
    });
    // 新设备登录、改密码、关闭两步验证等需要实时推送（见 lib/alerts.ts）。
    const alert = alertForAudit(action, { ...options, ip, userAgent: await getUserAgent() }, (await alertSite()).m);
    if (alert) await notifyInBackground(action, alert.title, alert.lines);
    if (++writesSincePrune >= PRUNE_EVERY) {
      writesSincePrune = 0;
      await prisma.auditLog.deleteMany({
        where: { createdAt: { lt: new Date(Date.now() - RETENTION_DAYS * 86_400_000) } },
      });
    }
  } catch (error) {
    console.error("[audit] failed to record", action, error);
  }
}
