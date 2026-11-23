import bcrypt from "bcryptjs";
import { headers } from "next/headers";
import { getAlertConfig } from "@/lib/alerts";
import { describeBackup, getBackupStatus } from "@/lib/backup-status";
import { prisma } from "@/lib/prisma";
import { SAMPLE_TUTORIAL_SLUGS } from "@/lib/sample-data";
import { defaultSettings, getSettings } from "@/lib/settings";
import { SITE_URL } from "@/lib/site-url";

/**
 * 新站上线检查清单（仪表盘顶部）：拿这套源码搭自己的教程站时，最容易漏掉的几件事。
 * 每一项给出「做没做」和去哪里改。
 */

export type ChecklistItem = { key: string; label: string; done: boolean; hint: string; href?: string };

/** 默认密码比较要跑一次 bcrypt（约 0.2 秒），按密码哈希记住结果，不是每次打开仪表盘都算。 */
const defaultPasswordCache = new Map<string, boolean>();
async function usesDefaultPassword(hash: string) {
  let result = defaultPasswordCache.get(hash);
  if (result === undefined) {
    result = await bcrypt.compare("admin123456", hash);
    defaultPasswordCache.set(hash, result);
  }
  return result;
}

export async function getLaunchChecklist(adminId: number): Promise<ChecklistItem[]> {
  const [settings, admin, sampleCount, backup, alerts, requestHeaders] = await Promise.all([
    getSettings(),
    prisma.admin.findUnique({ where: { id: adminId }, select: { password: true, totpSecret: true, _count: { select: { passkeys: true } } } }),
    prisma.tutorial.count({ where: { slug: { in: SAMPLE_TUTORIAL_SLUGS } } }),
    getBackupStatus(),
    getAlertConfig(),
    headers(),
  ]);
  const host = new URL(SITE_URL).hostname;
  const siteUrlOk = SITE_URL.startsWith("https://") && !/^(localhost|127\.|0\.0\.0\.0|\[::1\])/.test(host);
  const behindProxy = Boolean(requestHeaders.get("x-forwarded-for") || requestHeaders.get("x-real-ip"));
  const docker = process.env.DEPLOY_MODE === "docker";
  const branded = settings.brand.logoImage !== "" || settings.logoText !== defaultSettings.logoText || settings.brand.accentColor !== "";

  return [
    {
      key: "site-name",
      label: "改成自己的站名和首页文案",
      done: settings.siteName !== defaultSettings.siteName && settings.siteTitle !== defaultSettings.siteTitle,
      hint: "站点设置 → 基本信息、首页 Hero 文案",
      href: "/admin/settings",
    },
    {
      key: "brand",
      label: "换上自己的 Logo / 主题色",
      done: branded,
      hint: "站点设置 → 品牌（Logo 图片、网站图标、主题色）",
      href: "/admin/settings",
    },
    {
      key: "samples",
      label: "清除示例教程",
      done: sampleCount === 0,
      hint: sampleCount ? `还有 ${sampleCount} 篇种子数据里的示例教程` : "已清除",
    },
    {
      key: "password",
      label: "修改默认管理员密码",
      done: admin ? !(await usesDefaultPassword(admin.password)) : true,
      hint: "账号安全 → 修改密码",
      href: "/admin/account",
    },
    {
      key: "second-factor",
      label: "开启两步验证或通行密钥",
      done: Boolean(admin?.totpSecret) || (admin?._count.passkeys ?? 0) > 0,
      hint: "账号安全 → 两步验证 / 通行密钥",
      href: "/admin/account",
    },
    {
      key: "site-url",
      label: "设置正式域名 SITE_URL（https）",
      done: siteUrlOk,
      hint: siteUrlOk
        ? SITE_URL
        : `现在是 ${SITE_URL}：${
            docker ? "在 .env 里设置 SITE_URL=\"https://你的域名\" 后执行 docker compose up -d --build" : "在 .env.production 里设置 SITE_URL=\"https://你的域名\" 后重启"
          }，否则分享链接、sitemap 都是错的`,
    },
    {
      key: "trust-proxy",
      label: "在反向代理后面时设置 TRUST_PROXY=true",
      done: !behindProxy || process.env.TRUST_PROXY === "true",
      hint: behindProxy
        ? process.env.TRUST_PROXY === "true"
          ? "已设置"
          : "检测到请求经过 Nginx 等反向代理：设置 TRUST_PROXY=true，登录限流、阅读去重才拿得到真实 IP"
        : "没有检测到反向代理",
    },
    {
      key: "backup",
      label: "每天自动备份数据库",
      done: !describeBackup(backup).stale,
      hint: docker
        ? "在服务器 crontab 里每天执行 docker compose exec -T -u node app npm run backup，并把 docker-data 同步到异地（见 README「Docker 部署」）"
        : "在服务器 crontab 里每天执行 npm run backup，并同步到异地（见 README「安全加固」）",
    },
    {
      key: "alerts",
      label: "开启安全告警",
      done: alerts.channel !== "off",
      hint: "账号安全 → 安全告警（新设备登录、密码被修改等推送到手机）",
      href: "/admin/account#alerts",
    },
  ];
}
