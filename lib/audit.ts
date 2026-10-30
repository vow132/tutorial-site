import { prisma } from "@/lib/prisma";
import { getClientIp } from "@/lib/client-ip";

const RETENTION_DAYS = 365;
const PRUNE_EVERY = 200;
let writesSincePrune = 0;

/**
 * 记录一条后台安全审计日志。写日志失败不能影响业务本身，所以吞掉异常，
 * 只打印到服务器日志。
 */
export async function audit(
  action: string,
  options: { actor?: string | null; detail?: string | null } = {},
) {
  try {
    await prisma.auditLog.create({
      data: {
        action,
        actor: options.actor?.slice(0, 64) ?? null,
        ip: await getClientIp(),
        detail: options.detail?.slice(0, 500) ?? null,
      },
    });
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
