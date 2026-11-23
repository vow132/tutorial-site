import { prisma } from "@/lib/prisma";
import { ALERT_SETTING_KEY, parseAlertConfig, serializeAlertConfig } from "@/lib/alert-transport.mjs";
import { needsReseal } from "@/lib/secret-box.mjs";
import { openTotpSecret, sealTotpSecret } from "@/lib/second-factor";
import { getMailConfig, MAIL_SETTING_KEY, serializeMailConfig } from "@/lib/mail-store";

/**
 * 服务启动时运行一次：把还是明文的敏感字段加密，把用旧密钥加密的重新用当前主密钥加密
 * （例如新设置了 DATA_ENCRYPTION_KEY）。解不开的保持原样，由使用处提示管理员处理。
 * 条件更新：只有值没被别人改过时才写入。返回处理的条数。
 */
export async function resealSecrets() {
  let count = 0;

  const admins = await prisma.admin.findMany({
    where: { totpSecret: { not: null } },
    select: { id: true, totpSecret: true },
  });
  for (const admin of admins) {
    const stored = admin.totpSecret!;
    if (!needsReseal(stored)) continue;
    const secret = openTotpSecret(stored);
    if (!secret) continue;
    const { count: updated } = await prisma.admin.updateMany({
      where: { id: admin.id, totpSecret: stored },
      data: { totpSecret: sealTotpSecret(secret) },
    });
    count += updated;
  }

  const row = await prisma.setting.findUnique({ where: { key: ALERT_SETTING_KEY } });
  if (row && needsReseal(row.value)) {
    const config = parseAlertConfig(row.value);
    if (!config.locked) {
      const { count: updated } = await prisma.setting.updateMany({
        where: { key: ALERT_SETTING_KEY, value: row.value },
        data: { value: serializeAlertConfig(config) },
      });
      count += updated;
    }
  }

  // 发信配置（邮件订阅）：换了主密钥时用新密钥重新加密
  const mail = await prisma.setting.findUnique({ where: { key: MAIL_SETTING_KEY } });
  if (mail && needsReseal(mail.value)) {
    const config = await getMailConfig();
    if (config.host) {
      const { count: updated } = await prisma.setting.updateMany({
        where: { key: MAIL_SETTING_KEY, value: mail.value },
        data: { value: serializeMailConfig(config) },
      });
      count += updated;
    }
  }

  return count;
}
