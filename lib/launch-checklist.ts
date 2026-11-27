import bcrypt from "bcryptjs";
import { headers } from "next/headers";
import { clientIpFrom, trustsProxy } from "@/lib/client-ip";
import { getAlertConfig } from "@/lib/alerts";
import { describeBackup, getBackupStatus } from "@/lib/backup-status";
import { prisma } from "@/lib/prisma";
import { SAMPLE_TUTORIAL_SLUGS } from "@/lib/sample-data";
import { getSettings, isDefaultText } from "@/lib/settings";
import type { I18n } from "@/lib/i18n/core";
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

export async function getLaunchChecklist(adminId: number, i18n: I18n): Promise<ChecklistItem[]> {
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
  const behindCloudflare = Boolean(requestHeaders.get("cf-connecting-ip"));
  // 接在 Cloudflare 后面、TRUST_PROXY=true，但 Nginx 没配 real_ip：代理头里是 Cloudflare 节点的 IP，不是访客的
  const cloudflareIpLost =
    behindCloudflare &&
    process.env.TRUST_PROXY === "true" &&
    clientIpFrom((name) => requestHeaders.get(name), "true") !== clientIpFrom((name) => requestHeaders.get(name), "cloudflare");
  const behindProxy = behindCloudflare || Boolean(requestHeaders.get("x-forwarded-for") || requestHeaders.get("x-real-ip"));
  const docker = process.env.DEPLOY_MODE === "docker";
  const branded = settings.brand.logoImage !== "" || !isDefaultText("logoText", settings.logoText) || settings.brand.accentColor !== "";

  const t = i18n.m.admin.checklist;
  return [
    {
      key: "site-name",
      label: t.siteNameLabel,
      done: !isDefaultText("siteName", settings.siteName) && !isDefaultText("siteTitle", settings.siteTitle),
      hint: t.siteNameHint,
      href: "/admin/settings",
    },
    {
      key: "brand",
      label: t.brandLabel,
      done: branded,
      hint: t.brandHint,
      href: "/admin/settings",
    },
    {
      key: "samples",
      label: t.samplesLabel,
      done: sampleCount === 0,
      hint: sampleCount ? i18n.plural(sampleCount, t.samplesLeft) : t.samplesCleared,
    },
    {
      key: "password",
      label: t.passwordLabel,
      done: admin ? !(await usesDefaultPassword(admin.password)) : true,
      hint: t.passwordHint,
      href: "/admin/account",
    },
    {
      key: "second-factor",
      label: t.twoFactorLabel,
      done: Boolean(admin?.totpSecret) || (admin?._count.passkeys ?? 0) > 0,
      hint: t.twoFactorHint,
      href: "/admin/account",
    },
    {
      key: "site-url",
      label: t.siteUrlLabel,
      done: siteUrlOk,
      hint: siteUrlOk ? SITE_URL : i18n.f(docker ? t.siteUrlDocker : t.siteUrlPm2, { url: SITE_URL }),
    },
    {
      key: "trust-proxy",
      label: t.proxyLabel,
      done: !behindProxy || (trustsProxy() && !cloudflareIpLost),
      hint: behindProxy
        ? cloudflareIpLost
          ? t.proxyCloudflareLost
          : trustsProxy()
          ? i18n.f(t.proxySet, { value: process.env.TRUST_PROXY ?? "" })
          : behindCloudflare
            ? t.proxyCloudflare
            : t.proxyDetected
        : t.proxyNone,
    },
    {
      key: "backup",
      label: t.backupLabel,
      done: !describeBackup(backup, i18n).stale,
      hint: docker ? t.backupDocker : t.backupPm2,
    },
    {
      key: "alerts",
      label: t.alertsLabel,
      done: alerts.channel !== "off",
      hint: t.alertsHint,
      href: "/admin/account#alerts",
    },
  ];
}
