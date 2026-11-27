import { getClientIp } from "@/lib/client-ip";
import { isDemoMode } from "@/lib/demo";
import { getMailConfig, sendOne } from "@/lib/mail";
import { prisma } from "@/lib/prisma";
import { sharedLimiter } from "@/lib/rate-limit";
import { getSettings } from "@/lib/settings";
import { absoluteUrl } from "@/lib/site-url";
import { confirmEmail, mailConfigComplete, normalizeEmail, signSubscriberToken } from "@/lib/subscription";
import { verifyHuman } from "@/lib/turnstile-store";
import { getSiteI18n } from "@/lib/i18n/server";

const HOUR_MS = 60 * 60 * 1000;
/** 同一个地址 10 分钟内不重发确认邮件 */
const RESEND_MS = 10 * 60 * 1000;
/** 没确认的订阅保留 7 天 */
const PENDING_TTL_MS = 7 * 24 * HOUR_MS;

const ok = () => Response.json({ ok: true }, { status: 202 });

/**
 * 订阅新教程提醒（components/subscribe-form.tsx）：先发确认邮件，点了链接才算订阅（双重确认）。
 * - 不管地址是否已订阅都回同样的结果，不泄露谁订阅了；
 * - 防止被拿来给别人刷邮件：同源检查、隐藏字段拦机器人、同一 IP 每小时 5 次、全站每小时 60 封确认邮件、
 *   同一地址 10 分钟内不重发；后台开启了人机验证时还要核对 Turnstile 令牌。
 */
export async function POST(request: Request) {
  const site = request.headers.get("sec-fetch-site");
  if (site && site !== "same-origin") return new Response(null, { status: 403 });
  // 邮箱最长 254 个字符，人机验证的令牌最长 2048 个字符
  if (Number(request.headers.get("content-length") ?? 0) > 4096) return new Response(null, { status: 413 });

  let body: { email?: unknown; website?: unknown; turnstileToken?: unknown };
  try {
    body = ((await request.json()) ?? {}) as typeof body;
  } catch {
    return new Response(null, { status: 400 });
  }
  const email = normalizeEmail(body.email);
  const { m, locale } = await getSiteI18n();
  if (!email) return Response.json({ error: m.email.invalidEmail }, { status: 400 });
  // 隐藏的「网址」字段：真人看不到也不会填，填了的是机器人，假装成功
  if (typeof body.website === "string" && body.website.trim()) return ok();

  const config = await getMailConfig();
  // 演示站不发邮件：否则谁都能用它给任意邮箱发确认信
  if (isDemoMode() || !config.enabled || !mailConfigComplete(config)) return Response.json({ error: m.email.subscribeDisabled }, { status: 404 });

  const ip = await getClientIp();
  const perVisitor = sharedLimiter("subscribe-visitor", 5, HOUR_MS, 20_000);
  const siteWide = sharedLimiter("subscribe-global", 60, HOUR_MS, 1);
  if ((ip && perVisitor.retryAfter(ip) > 0) || siteWide.retryAfter("all") > 0) {
    return Response.json({ error: m.email.tooFrequent }, { status: 429 });
  }
  if (ip) perVisitor.hit(ip);
  // 在限流之后核对：乱填令牌的请求也受上面的次数限制，不会无限制地替人去请求 Cloudflare
  const human = await verifyHuman(body.turnstileToken, "subscribe");
  if (!human.ok) return Response.json({ error: m.email.humanCheckFailed }, { status: 400 });

  await prisma.subscriber.deleteMany({ where: { confirmedAt: null, createdAt: { lt: new Date(Date.now() - PENDING_TTL_MS) } } });
  const existing = await prisma.subscriber.findUnique({ where: { email } });
  if (existing?.confirmedAt) return ok();
  if (existing?.confirmSentAt && Date.now() - existing.confirmSentAt.getTime() < RESEND_MS) return ok();

  const subscriber = existing
    ? await prisma.subscriber.update({ where: { id: existing.id }, data: { confirmSentAt: new Date() } })
    : await prisma.subscriber.create({ data: { email, confirmSentAt: new Date() } });
  siteWide.hit("all");

  const { siteName } = await getSettings();
  const confirmUrl = absoluteUrl(`/subscribe/confirm?token=${signSubscriberToken(subscriber.id, "confirm")}`);
  try {
    await sendOne(config, siteName, { to: email, ...confirmEmail({ siteName, confirmUrl, t: m.email, locale }) });
  } catch (error) {
    console.warn("[subscription] 确认邮件发送失败：", error instanceof Error ? error.message : error);
    // 允许稍后重试
    await prisma.subscriber.update({ where: { id: subscriber.id }, data: { confirmSentAt: null } });
    return Response.json({ error: m.email.sendFailed }, { status: 502 });
  }
  return ok();
}
