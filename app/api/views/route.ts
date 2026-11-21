import { getClientIp, getUserAgent } from "@/lib/client-ip";
import { referrerSource } from "@/lib/referrer";
import { SITE_URL } from "@/lib/site-url";
import { countTutorialRead, countTutorialView } from "@/lib/view-counter";

const SITE_HOST = (() => {
  try {
    return new URL(SITE_URL).hostname;
  } catch {
    return null;
  }
})();

/**
 * 文章阅读量上报（components/view-beacon.tsx 调用）。
 * - `{ id, ref }`：打开文章，ref 是来源网站的域名（浏览器只给域名，不带路径和搜索词）；
 * - `{ id, read: true }`：读到正文末尾（components/reading-progress.tsx 判断）。
 * 爬虫过滤、按 IP 去重、批量写库都在 lib/view-counter.ts 里。
 */
export async function POST(request: Request) {
  // 现代浏览器都会带 Sec-Fetch-Site：拒绝别的网站在页面里嵌脚本替人刷阅读量。
  const site = request.headers.get("sec-fetch-site");
  if (site && site !== "same-origin") return new Response(null, { status: 403 });

  if (Number(request.headers.get("content-length") ?? 0) > 1024) {
    return new Response(null, { status: 413 });
  }

  let body: { id?: unknown; ref?: unknown; read?: unknown };
  try {
    body = ((await request.json()) ?? {}) as typeof body;
  } catch {
    return new Response(null, { status: 400 });
  }
  const id = Number(body.id);
  if (!Number.isSafeInteger(id) || id <= 0) return new Response(null, { status: 400 });

  const visitor = { ip: await getClientIp(), userAgent: await getUserAgent() };
  if (body.read === true) countTutorialRead(id, visitor);
  else countTutorialView(id, visitor, referrerSource(body.ref, SITE_HOST));
  return new Response(null, { status: 204 });
}
