import { prisma } from "@/lib/prisma";
import { absoluteUrl } from "@/lib/site-url";
import { readSubscriberToken } from "@/lib/subscription";

/**
 * 确认订阅：确认页（/subscribe/confirm）上的按钮提交到这里。
 * 不用 GET 直接确认：邮箱的安全扫描会自动「点开」邮件里的链接，那样等于替人确认了。
 */
export async function POST(request: Request) {
  const form = await request.formData().catch(() => null);
  const id = readSubscriberToken(form?.get("token"), "confirm");
  if (id) await prisma.subscriber.updateMany({ where: { id, confirmedAt: null }, data: { confirmedAt: new Date() } });
  // 已经确认过的再点一次也算成功；订阅不存在（过期被清理、已退订）则提示链接失效
  const confirmed = id ? (await prisma.subscriber.count({ where: { id, confirmedAt: { not: null } } })) > 0 : false;
  return Response.redirect(absoluteUrl(`/subscribe/confirm?status=${confirmed ? "ok" : "invalid"}`), 303);
}
