/**
 * 站点根地址：canonical / sitemap / OpenGraph / JSON-LD 等绝对链接的基准。
 * 生产环境必须用 SITE_URL 覆盖，否则搜索引擎拿到的全是 localhost 链接。
 */
const configured = process.env.SITE_URL?.trim();

export const SITE_URL = (configured || "http://localhost:3000").replace(/\/+$/, "");

/** 把站内路径（以 / 开头）拼成绝对地址。 */
export function absoluteUrl(path = "/"): string {
  return `${SITE_URL}${path.startsWith("/") ? path : `/${path}`}`;
}

const globalForSiteUrl = globalThis as typeof globalThis & {
  __siteUrlWarned?: boolean;
};

// 只在生产服务运行时提醒一次；构建阶段（CI 里通常没配域名）不刷屏。
if (
  process.env.NODE_ENV === "production" &&
  process.env.NEXT_PHASE !== "phase-production-build" &&
  !globalForSiteUrl.__siteUrlWarned &&
  (!configured || /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/i.test(SITE_URL))
) {
  globalForSiteUrl.__siteUrlWarned = true;
  // 启动日志不知道站长用什么语言，中英文各写一行（和安装码提示一样）
  const docker = process.env.DEPLOY_MODE === "docker";
  console.warn(
    `[seo] SITE_URL 未设置或指向本机（当前 ${SITE_URL}）：canonical、sitemap、分享卡片都会是错误地址。` +
      (docker
        ? "请在 .env 中设置 SITE_URL=\"https://你的域名\" 后执行 docker compose up -d。"
        : "请在 .env.production 中设置 SITE_URL=\"https://你的域名\" 后重启。") +
      `\n[seo] SITE_URL is not set or points to this machine (currently ${SITE_URL}): canonical URLs, the sitemap and share cards will use the wrong address. ` +
      (docker
        ? "Set SITE_URL=\"https://your-domain\" in .env and run docker compose up -d."
        : "Set SITE_URL=\"https://your-domain\" in .env.production and restart."),
  );
}
