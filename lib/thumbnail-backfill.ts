import { prisma } from "@/lib/prisma";
import { firstUploadedImage, thumbnailFor } from "@/lib/article";

/**
 * 服务启动时运行：给还没有缩略图、但有封面或正文含图片的教程补上缩略图
 * （缩略图功能上线前的旧文章，以及 npm run images:variants 补出小图之后）。
 * 只查可能有图的行，已经有缩略图的不再处理。返回补上的条数。
 */
export async function backfillThumbnails() {
  const rows = await prisma.tutorial.findMany({
    where: {
      thumbnail: null,
      OR: [{ cover: { not: null } }, { content: { contains: "/uploads/" } }],
    },
    select: { id: true, cover: true, content: true },
  });
  let count = 0;
  for (const row of rows) {
    const thumbnail = await thumbnailFor(row.cover ?? firstUploadedImage(row.content));
    if (!thumbnail) continue;
    // 用原生 SQL 更新：不能动 updatedAt（sitemap lastmod、文章「更新于」都依赖它）。
    count += await prisma.$executeRaw`UPDATE "Tutorial" SET "thumbnail" = ${thumbnail} WHERE "id" = ${row.id} AND "thumbnail" IS NULL`;
  }
  return count;
}
