import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/site-url";

// 不做成纯静态：Docker 镜像是预先构建好的，站点地址（SITE_URL）要到运行时才知道，
// 容器启动时会删掉构建时生成的页面，让 robots.txt 按真实地址重新生成。
export const revalidate = 3600;

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        // 后台与登录页不对外收录
        disallow: ["/admin", "/admin/", "/api/"],
      },
    ],
    sitemap: `${SITE_URL.replace(/\/$/, "")}/sitemap.xml`,
  };
}
