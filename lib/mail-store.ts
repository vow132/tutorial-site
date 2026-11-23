import { prisma } from "@/lib/prisma";
import { openSecret, sealSecret } from "@/lib/secret-box.mjs";
import { emptyMailConfig, readMailConfig, type MailConfig } from "@/lib/subscription";

/**
 * 发信配置的存取：整份 JSON 用 lib/secret-box.mjs 加密后存在 Setting key=mail。
 * 不依赖 Next 缓存，启动时的密钥轮换（lib/secret-migration.ts）也能直接用。
 */

export const MAIL_SETTING_KEY = "mail";
const PURPOSE = "mail";

export async function getMailConfig(): Promise<MailConfig> {
  const row = await prisma.setting.findUnique({ where: { key: MAIL_SETTING_KEY } });
  if (!row) return emptyMailConfig;
  try {
    return readMailConfig(JSON.parse(openSecret(row.value, PURPOSE)));
  } catch {
    // 密钥换了解不开：当作没配置，后台会提示重新填写
    return emptyMailConfig;
  }
}

export function serializeMailConfig(config: MailConfig) {
  return sealSecret(JSON.stringify(config), PURPOSE);
}

export async function saveMailConfig(config: MailConfig) {
  const value = serializeMailConfig(config);
  await prisma.setting.upsert({ where: { key: MAIL_SETTING_KEY }, update: { value }, create: { key: MAIL_SETTING_KEY, value } });
}
