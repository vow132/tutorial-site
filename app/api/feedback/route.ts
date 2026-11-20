import { getClientIp, getUserAgent } from "@/lib/client-ip";
import { prisma } from "@/lib/prisma";
import { sharedLimiter } from "@/lib/rate-limit";
import { NON_HUMAN_AGENT } from "@/lib/view-counter";

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * 「这篇有帮助吗」投票（components/helpful-feedback.tsx 调用）。
 * - 同一 IP 对同一篇一天只算一票（需要 TRUST_PROXY 才拿得到 IP）；浏览器端也会记住已投过；
 * - 每篇每小时最多计 200 票，拿不到 IP 时也不至于被脚本无限刷；
 * - 计数用原生 SQL 自增，不刷新 updatedAt；只给已发布的教程计数。
 */
export async function POST(request: Request) {
  const site = request.headers.get("sec-fetch-site");
  if (site && site !== "same-origin") return new Response(null, { status: 403 });
  if (Number(request.headers.get("content-length") ?? 0) > 1024) return new Response(null, { status: 413 });

  let id: number;
  let helpful: unknown;
  try {
    ({ id, helpful } = (await request.json()) as { id: number; helpful: unknown });
    id = Number(id);
  } catch {
    return new Response(null, { status: 400 });
  }
  if (!Number.isSafeInteger(id) || id <= 0 || typeof helpful !== "boolean") return new Response(null, { status: 400 });

  const userAgent = await getUserAgent();
  if (!userAgent || NON_HUMAN_AGENT.test(userAgent)) return new Response(null, { status: 204 });

  const ip = await getClientIp();
  const perVisitor = sharedLimiter("feedback-visitor", 1, DAY_MS, 50_000);
  const perTutorial = sharedLimiter("feedback-tutorial", 200, 60 * 60 * 1000, 10_000);
  const visitorKey = ip ? `${id}:${ip}` : null;
  // 重复投票和超出上限都安静地返回 204：不告诉脚本哪一票被丢掉了
  if ((visitorKey && perVisitor.retryAfter(visitorKey) > 0) || perTutorial.retryAfter(String(id)) > 0) {
    return new Response(null, { status: 204 });
  }
  if (visitorKey) perVisitor.hit(visitorKey);
  perTutorial.hit(String(id));

  if (helpful) {
    await prisma.$executeRaw`UPDATE "Tutorial" SET "helpfulYes" = "helpfulYes" + 1 WHERE "id" = ${id} AND "published" = 1`;
  } else {
    await prisma.$executeRaw`UPDATE "Tutorial" SET "helpfulNo" = "helpfulNo" + 1 WHERE "id" = ${id} AND "published" = 1`;
  }
  return new Response(null, { status: 204 });
}
