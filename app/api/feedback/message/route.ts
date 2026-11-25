import { getClientIp, getUserAgent } from "@/lib/client-ip";
import { cleanFeedbackMessage, MAX_FEEDBACK_MESSAGE } from "@/lib/feedback";
import { prisma } from "@/lib/prisma";
import { sharedLimiter } from "@/lib/rate-limit";
import { NON_HUMAN_AGENT } from "@/lib/view-counter";
import { isDemoMode } from "@/lib/demo";

const HOUR_MS = 60 * 60 * 1000;

/**
 * 读者点「没帮助」之后留的一句话（components/helpful-feedback.tsx 调用），只在后台「读者留言」里显示。
 * 防刷：同源检查；同一 IP 每小时 5 条（需要 TRUST_PROXY）；每篇每小时 30 条；全站每小时 200 条。
 * 超出上限也返回 204，不告诉脚本哪条被丢掉了。
 */
export async function POST(request: Request) {
  const site = request.headers.get("sec-fetch-site");
  if (site && site !== "same-origin") return new Response(null, { status: 403 });
  // 500 个汉字的 UTF-8 约 1.5KB，再加 JSON 外壳和转义
  if (Number(request.headers.get("content-length") ?? 0) > MAX_FEEDBACK_MESSAGE * 8 + 256) {
    return new Response(null, { status: 413 });
  }

  let body: { id?: unknown; message?: unknown };
  try {
    body = ((await request.json()) ?? {}) as typeof body;
  } catch {
    return new Response(null, { status: 400 });
  }
  const id = Number(body.id);
  const message = cleanFeedbackMessage(body.message);
  if (!Number.isSafeInteger(id) || id <= 0 || !message) return new Response(null, { status: 400 });

  const userAgent = await getUserAgent();
  if (!userAgent || NON_HUMAN_AGENT.test(userAgent)) return new Response(null, { status: 204 });

  const ip = await getClientIp();
  const perVisitor = sharedLimiter("feedback-message-visitor", 5, HOUR_MS, 20_000);
  const perTutorial = sharedLimiter("feedback-message-tutorial", 30, HOUR_MS, 10_000);
  const siteWide = sharedLimiter("feedback-message-global", 200, HOUR_MS, 1);
  if (
    (ip && perVisitor.retryAfter(ip) > 0) ||
    perTutorial.retryAfter(String(id)) > 0 ||
    siteWide.retryAfter("all") > 0
  ) {
    return new Response(null, { status: 204 });
  }
  if (ip) perVisitor.hit(ip);
  perTutorial.hit(String(id));
  siteWide.hit("all");

  // 只收已发布教程的留言；教程不存在或是草稿时什么也不存
  // 演示站不存留言：后台对所有访客开放，存下来就等于公开展示陌生人写的话
  if (isDemoMode()) return new Response(null, { status: 204 });
  const tutorial = await prisma.tutorial.findFirst({ where: { id, published: true }, select: { id: true } });
  if (tutorial) await prisma.feedbackMessage.create({ data: { tutorialId: id, message } });
  return new Response(null, { status: 204 });
}
