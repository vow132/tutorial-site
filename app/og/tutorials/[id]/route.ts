import { prisma } from "@/lib/prisma";
import { getSettings } from "@/lib/settings";
import { shareImageVersion, type ShareCard } from "@/lib/share-image";
import { renderShareImage } from "@/lib/share-image-render";

/**
 * 文章分享图：/og/tutorials/<id>?v=<内容版本>。只给已发布的文章生成。
 * 版本号对得上时长期缓存（内容一改地址就变）；对不上（旧链接）时按当前内容短期缓存。
 */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: rawId } = await params;
  const id = Number(rawId);
  if (!Number.isSafeInteger(id) || id <= 0) return new Response("Not Found", { status: 404 });

  const tutorial = await prisma.tutorial.findFirst({
    where: { id, published: true },
    select: { title: true, category: { select: { name: true, color: true } } },
  });
  if (!tutorial) return new Response("Not Found", { status: 404 });

  const { siteName, logoText, brand } = await getSettings();
  const card: ShareCard = {
    title: tutorial.title,
    categoryName: tutorial.category.name,
    categoryColor: tutorial.category.color,
    siteName,
    logoText,
    accent: brand.accentColor || undefined,
  };
  const version = shareImageVersion(card);
  try {
    const png = await renderShareImage(`${id}:${version}`, card);
    const current = new URL(request.url).searchParams.get("v") === version;
    return new Response(png as BodyInit, {
      headers: {
        "Content-Type": "image/png",
        "Cache-Control": current ? "public, max-age=31536000, immutable" : "public, max-age=300",
      },
    });
  } catch (error) {
    console.error("[share-image] 生成失败：", error);
    return new Response("Failed to generate image", { status: 500 });
  }
}
