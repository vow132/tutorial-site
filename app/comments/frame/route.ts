import { randomBytes } from "node:crypto";
import { commentEmbed, commentFrameCsp, commentFrameHtml, commentPagePath } from "@/lib/comments";
import { isDemoMode } from "@/lib/demo";
import { prisma } from "@/lib/prisma";
import { getSettings } from "@/lib/settings";
import { messagesFor } from "@/lib/i18n/messages";
import { getRequestReaderI18n } from "@/lib/i18n/reader-server";

/**
 * 评论区小页面：文章页文末的 iframe（components/comments.tsx）加载它。
 * 按站点设置里选的评论服务输出 HTML 和只放行该服务的 CSP（lib/comments.ts）；文章不存在、
 * 没开评论或者是演示站时 404。每次请求一个新的 nonce，所以不能缓存。
 */
export const dynamic = "force-dynamic";

const notFound = () => new Response("Not Found", { status: 404, headers: { "Cache-Control": "no-store" } });

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const slug = params.get("slug") ?? "";
  const theme = params.get("theme") === "dark" ? "dark" : "light";
  // 演示站的后台对所有人开放，访客写的字不能经由本站展示给别人
  if (isDemoMode() || !slug || slug.length > 200) return notFound();

  // 评论组件的界面语言跟读者选的语言走（iframe 和文章页同源，带着同一个 Cookie）
  const [{ comments }, { locale }] = await Promise.all([getSettings(), getRequestReaderI18n()]);
  if (comments.provider === "none") return notFound();
  const tutorial = await prisma.tutorial.findFirst({ where: { slug, published: true }, select: { title: true } });
  if (!tutorial) return notFound();
  const embed = commentEmbed(comments, { path: commentPagePath(slug), title: tutorial.title }, theme, locale);
  if (!embed) return notFound();

  const nonce = randomBytes(16).toString("base64");
  const t = messagesFor(locale).site.comments;
  return new Response(commentFrameHtml(embed, nonce, theme, { lang: locale, title: t.frameTitle, loadFailed: t.loadFailed }), {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Content-Security-Policy": commentFrameCsp(embed, nonce),
      "X-Frame-Options": "SAMEORIGIN",
      "X-Robots-Tag": "noindex",
      "Cache-Control": "no-store",
    },
  });
}
