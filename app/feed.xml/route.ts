import { prisma } from "@/lib/prisma";
import { getSettings } from "@/lib/settings";
import { SITE_URL } from "@/lib/site-url";

// 10 分钟重新生成一次，与下方 Cache-Control 一致。
export const revalidate = 600;

function escapeXml(input: string) {
  return input
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

export async function GET() {
  const base = SITE_URL.replace(/\/$/, "");

  const [tutorials, settings] = await Promise.all([
    prisma.tutorial.findMany({
      where: { published: true },
      orderBy: { updatedAt: "desc" },
      take: 20,
      select: {
        title: true,
        slug: true,
        excerpt: true,
        updatedAt: true,
        category: { select: { name: true } },
      },
    }),
    // getSettings 带缓存，设置 JSON 损坏或读取失败时回退默认值，不会让订阅源 500。
    getSettings(),
  ]);

  const { siteTitle, siteDescription } = settings;

  const items = tutorials
    .map((t) => {
      const url = `${base}/tutorials/${encodeURIComponent(t.slug)}`;
      return `    <item>
      <title>${escapeXml(t.title)}</title>
      <link>${url}</link>
      <guid isPermaLink="true">${url}</guid>
      <category>${escapeXml(t.category.name)}</category>
      <pubDate>${new Date(t.updatedAt).toUTCString()}</pubDate>
      <description>${escapeXml(t.excerpt ?? "")}</description>
    </item>`;
    })
    .join("\n");

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>${escapeXml(siteTitle)}</title>
    <link>${base}</link>
    <description>${escapeXml(siteDescription)}</description>
    <language>zh-CN</language>
    <atom:link href="${base}/feed.xml" rel="self" type="application/rss+xml"/>
${items}
  </channel>
</rss>`;

  return new Response(xml, {
    headers: {
      "Content-Type": "application/rss+xml; charset=utf-8",
      "Cache-Control": "public, max-age=600",
    },
  });
}
