import type { MetadataRoute } from "next";
import { aiCrawlerRule } from "@/lib/anti-scrape";
import { getSettings } from "@/lib/settings";
import { SITE_URL } from "@/lib/site-url";

// 不做成纯静态：Docker 镜像是预先构建好的，站点地址（SITE_URL）要到运行时才知道，
// 容器启动时会删掉构建时生成的页面，让 robots.txt 按真实地址重新生成。
// 后台「站点设置 → 防爬」保存时会立即刷新（lib/actions/settings.ts）。
export const revalidate = 3600;

export default async function robots(): Promise<MetadataRoute.Robots> {
  const { antiScrape } = await getSettings();
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        // 后台与登录页不对外收录
        disallow: ["/admin", "/admin/", "/api/"],
      },
      // 拒绝 AI 训练爬虫（lib/anti-scrape.ts）：搜索引擎和 AI 搜索不受影响
      ...(antiScrape.blockAiCrawlers ? [aiCrawlerRule()] : []),
    ],
    sitemap: `${SITE_URL.replace(/\/$/, "")}/sitemap.xml`,
  };
}
