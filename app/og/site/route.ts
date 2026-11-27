import { getSettings } from "@/lib/settings";
import { shareImageVersion, siteShareCard } from "@/lib/share-image";
import { renderShareImage } from "@/lib/share-image-render";
import { messagesFor } from "@/lib/i18n/messages";

/**
 * 站点默认分享图：/og/site?v=<版本>。首页、列表页等没有配图的页面用它，
 * 内容来自站点设置（首页大标题、徽标文字、站名、主题色），站长改设置后地址随之变化。
 * 后台上传了「默认分享图」时页面直接用上传的图，不会请求这里。
 */
export async function GET(request: Request) {
  const settings = await getSettings();
  const card = siteShareCard(settings, messagesFor(settings.locale).site.share.siteCta);
  const version = shareImageVersion(card);
  try {
    const png = await renderShareImage(`site:${version}`, card);
    const current = new URL(request.url).searchParams.get("v") === version;
    return new Response(png as BodyInit, {
      headers: {
        "Content-Type": "image/png",
        "Cache-Control": current ? "public, max-age=31536000, immutable" : "public, max-age=300",
      },
    });
  } catch (error) {
    console.error("[share-image] 站点分享图生成失败：", error);
    return new Response("Internal Server Error", { status: 500 });
  }
}
