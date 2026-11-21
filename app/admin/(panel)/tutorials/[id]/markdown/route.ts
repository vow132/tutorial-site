import { getCurrentAdmin } from "@/lib/admin-auth";
import { tutorialToMarkdown } from "@/lib/markdown-export";
import { prisma } from "@/lib/prisma";
import { SITE_URL } from "@/lib/site-url";
import { tutorialTagNames } from "@/lib/tag-sync";

/** 后台「导出 Markdown」：下载已保存的版本（草稿也可以），文件名用 slug。 */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await getCurrentAdmin())) return new Response("未登录或会话已过期", { status: 401 });
  const { id } = await params;
  const tutorial = await prisma.tutorial.findUnique({
    where: { id: Number(id) || 0 },
    select: { id: true, title: true, slug: true, excerpt: true, content: true, createdAt: true, updatedAt: true },
  });
  if (!tutorial) return new Response("教程不存在", { status: 404 });
  const markdown = tutorialToMarkdown({ ...tutorial, tags: await tutorialTagNames(tutorial.id) }, SITE_URL);
  // 中文 slug 用 filename* 传 UTF-8 文件名，老浏览器退回纯 ASCII 的名字
  const asciiName = /^[\w.-]+$/.test(tutorial.slug) ? tutorial.slug : `tutorial-${tutorial.id}`;
  return new Response(markdown, {
    headers: {
      "Content-Type": "text/markdown; charset=utf-8",
      "Content-Disposition": `attachment; filename="${asciiName}.md"; filename*=UTF-8''${encodeURIComponent(tutorial.slug)}.md`,
      "Cache-Control": "no-store",
    },
  });
}
