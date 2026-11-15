import { getClientIp, getUserAgent } from "@/lib/client-ip";
import { countTutorialView } from "@/lib/view-counter";

/**
 * 文章阅读量上报（components/view-beacon.tsx 调用）。
 * 爬虫过滤、按 IP 去重、批量写库都在 countTutorialView 里，与之前在页面里计数时一致。
 */
export async function POST(request: Request) {
  // 现代浏览器都会带 Sec-Fetch-Site：拒绝别的网站在页面里嵌脚本替人刷阅读量。
  const site = request.headers.get("sec-fetch-site");
  if (site && site !== "same-origin") return new Response(null, { status: 403 });

  if (Number(request.headers.get("content-length") ?? 0) > 1024) {
    return new Response(null, { status: 413 });
  }

  let id: number;
  try {
    id = Number(((await request.json()) as { id?: unknown })?.id);
  } catch {
    return new Response(null, { status: 400 });
  }
  if (!Number.isSafeInteger(id) || id <= 0) return new Response(null, { status: 400 });

  countTutorialView(id, { ip: await getClientIp(), userAgent: await getUserAgent() });
  return new Response(null, { status: 204 });
}
