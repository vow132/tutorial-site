import { cache } from "react";
import { unstable_cache } from "next/cache";
import nodemailer from "nodemailer";
import { CACHE_TAGS, SLOW_REVALIDATE_SECONDS } from "@/lib/public-data";
import { getMailConfig } from "@/lib/mail-store";
import { mailConfigComplete, type MailConfig } from "@/lib/subscription";
import { isDemoMode } from "@/lib/demo";

/**
 * 发信：读者能否看到订阅框由 getSubscriptionEnabled() 决定（不含密钥，可缓存）；
 * 配置的加密存取在 lib/mail-store.ts。
 */
export { getMailConfig, saveMailConfig, MAIL_SETTING_KEY } from "@/lib/mail-store";

const cachedEnabled = unstable_cache(
  async () => {
    const config = await getMailConfig();
    return config.enabled && mailConfigComplete(config);
  },
  ["subscription-enabled"],
  // 保存发信配置时按 settings 标签失效
  { tags: [CACHE_TAGS.settings], revalidate: SLOW_REVALIDATE_SECONDS },
);

/** 前台是否显示订阅框（演示站不开订阅，见 lib/demo.ts）。 */
export const getSubscriptionEnabled = cache(async () => !isDemoMode() && (await cachedEnabled()));

export type OutgoingMail = { to: string; subject: string; text: string; html: string; headers?: Record<string, string> };

/** 建一个发信连接（批量发送时复用同一个连接），用完调用 close()。 */
export function createMailer(config: MailConfig, siteName: string) {
  const transport = nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.secure,
    auth: config.user ? { user: config.user, pass: config.pass } : undefined,
    pool: true,
    maxConnections: 1,
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 20_000,
  });
  const from = { name: config.fromName || siteName, address: config.fromEmail };
  return {
    send: (mail: OutgoingMail) => transport.sendMail({ from, ...mail }),
    close: () => transport.close(),
  };
}

/** 发一封邮件（确认邮件、测试邮件）。失败时抛出，错误信息不含密码。 */
export async function sendOne(config: MailConfig, siteName: string, mail: OutgoingMail) {
  const mailer = createMailer(config, siteName);
  try {
    await mailer.send(mail);
  } finally {
    mailer.close();
  }
}
