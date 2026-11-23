import { prisma } from "@/lib/prisma";
import { absoluteUrl } from "@/lib/site-url";
import { readSubscriberToken } from "@/lib/subscription";

/**
 * 退订：
 * - 退订页（/subscribe/unsubscribe）上的按钮提交表单（token 在表单里），完成后跳回退订页；
 * - 邮箱客户端的「一键退订」（RFC 8058）：POST 到 /api/unsubscribe?token=…，正文是 List-Unsubscribe=One-Click。
 * 退订直接删除这条订阅，不保留邮箱。
 */
export async function POST(request: Request) {
  const url = new URL(request.url);
  const form = await request.formData().catch(() => null);
  const oneClick = form?.get("List-Unsubscribe") === "One-Click";
  const token = url.searchParams.get("token") ?? form?.get("token");
  const id = readSubscriberToken(token, "unsubscribe");
  if (id) await prisma.subscriber.deleteMany({ where: { id } });
  if (oneClick) return new Response(id ? "已退订" : "链接无效", { status: id ? 200 : 400 });
  return Response.redirect(absoluteUrl(`/subscribe/unsubscribe?status=${id ? "ok" : "invalid"}`), 303);
}
