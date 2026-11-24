import { siteIconPng } from "@/lib/site-icon";

// 跟着后台设置变：不能在构建时生成成静态文件
export const dynamic = "force-dynamic";

/**
 * /favicon.ico：页面里已经用 <link rel="icon"> 指向 /brand/icon，这里给直接请求 /favicon.ico 的浏览器、RSS 阅读器等用。
 * 内容是 PNG（现在的浏览器都认），和网站图标保持一致；地址不带版本，所以只缓存一天。
 */
export async function GET() {
  try {
    const { png } = await siteIconPng(32);
    return new Response(png as BodyInit, { headers: { "Content-Type": "image/png", "Cache-Control": "public, max-age=86400" } });
  } catch (error) {
    console.error("[favicon] 生成失败：", error);
    return new Response("Not Found", { status: 404 });
  }
}
