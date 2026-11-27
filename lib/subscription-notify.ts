import { prisma } from "@/lib/prisma";
import { createMailer, getMailConfig } from "@/lib/mail";
import { defaultSettings, SETTINGS_KEY } from "@/lib/settings";
import { readLocale } from "@/lib/i18n/locales";
import { messagesFor } from "@/lib/i18n/messages";
import { absoluteUrl } from "@/lib/site-url";
import { mailConfigComplete, newTutorialEmail, signSubscriberToken } from "@/lib/subscription";

/**
 * 新教程发布后通知确认过的订阅者。每篇只发一次：先用条件更新「认领」（notifiedAt 从空变为现在），
 * 认领成功的那一次才发，所以重复调用、撤回再发布都不会重发。
 * 在后台慢慢发（每封间隔一会儿，避免触发邮件服务商的频率限制），不阻塞保存教程的请求。
 */

const BATCH = 50;
const GAP_MS = 300;

/** 和 Prisma 在 SQLite 里存 DateTime 的格式一致（原生 SQL 写入，不刷新 updatedAt）。 */
const sqliteNow = () => new Date().toISOString().replace("Z", "+00:00");

/** 站点名和网站语言：发信在请求之外慢慢进行，不能用依赖 Next 缓存的 getSettings()，直接读库。 */
async function siteInfo() {
  const row = await prisma.setting.findUnique({ where: { key: SETTINGS_KEY } });
  try {
    const parsed = JSON.parse(row?.value ?? "{}") as { siteName?: unknown; locale?: unknown };
    const locale = readLocale(parsed.locale);
    const name = typeof parsed.siteName === "string" && parsed.siteName ? parsed.siteName : messagesFor(locale).defaults.siteName;
    return { name, locale };
  } catch {
    return { name: defaultSettings.siteName, locale: defaultSettings.locale };
  }
}

export function notifyNewTutorial(tutorialId: number) {
  void send(tutorialId).catch((error) => {
    console.warn("[subscription] 新教程通知失败：", error instanceof Error ? error.message : error);
  });
}

async function send(tutorialId: number) {
  const config = await getMailConfig();
  if (!config.enabled || !mailConfigComplete(config)) return;
  const claimed = await prisma.$executeRaw`
    UPDATE "Tutorial" SET "notifiedAt" = ${sqliteNow()}
    WHERE "id" = ${tutorialId} AND "published" = 1 AND "notifiedAt" IS NULL
  `;
  if (claimed !== 1) return;
  const tutorial = await prisma.tutorial.findUnique({ where: { id: tutorialId }, select: { title: true, slug: true, excerpt: true } });
  if (!tutorial) return;
  const { name, locale } = await siteInfo();
  const t = messagesFor(locale).email;
  const url = absoluteUrl(`/tutorials/${encodeURIComponent(tutorial.slug)}`);
  const mailer = createMailer(config, name);
  let sent = 0;
  try {
    for (let cursor = 0; ; ) {
      const subscribers = await prisma.subscriber.findMany({
        where: { confirmedAt: { not: null }, id: { gt: cursor } },
        orderBy: { id: "asc" },
        take: BATCH,
        select: { id: true, email: true },
      });
      if (subscribers.length === 0) break;
      for (const subscriber of subscribers) {
        cursor = subscriber.id;
        const unsubscribeUrl = absoluteUrl(`/subscribe/unsubscribe?token=${signSubscriberToken(subscriber.id, "unsubscribe")}`);
        const oneClick = absoluteUrl(`/api/unsubscribe?token=${signSubscriberToken(subscriber.id, "unsubscribe")}`);
        try {
          await mailer.send({
            to: subscriber.email,
            ...newTutorialEmail({ siteName: name, title: tutorial.title, excerpt: tutorial.excerpt, url, unsubscribeUrl, t, locale }),
            // 邮箱客户端里的「退订」按钮（RFC 8058 一键退订）
            headers: { "List-Unsubscribe": `<${oneClick}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" },
          });
          sent++;
        } catch (error) {
          console.warn(`[subscription] 发给订阅者 #${subscriber.id} 失败：`, error instanceof Error ? error.message : error);
        }
        await new Promise((resolve) => setTimeout(resolve, GAP_MS));
      }
    }
  } finally {
    mailer.close();
  }
  console.info(`[subscription] 「${tutorial.title}」已通知 ${sent} 位订阅者`);
}
