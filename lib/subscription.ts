import { createHmac, timingSafeEqual } from "node:crypto";
import { authSecretFrom } from "@/lib/auth-secret.mjs";
import { format } from "@/lib/i18n/format";
import type { Locale } from "@/lib/i18n/locales";
import { email as zhEmail } from "@/lib/i18n/messages/zh-CN/email";

/**
 * 邮件订阅的纯函数：邮箱校验、发信配置校验、确认/退订链接签名、邮件内容。
 * 发信和数据库在 lib/mail.ts、lib/subscription-notify.ts。
 */

export function normalizeEmail(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const email = raw.trim().toLowerCase();
  if (email.length > 254 || !/^[^\s@<>"',;:()]+@[^\s@<>"',;:()]+\.[a-z0-9-]{2,}$/i.test(email)) return null;
  return email;
}

/** 后台列表里显示的打码邮箱：zhang***@example.com */
export function maskEmail(email: string) {
  const [name, domain] = email.split("@");
  return `${name.slice(0, Math.min(3, Math.max(1, name.length - 1)))}***@${domain}`;
}

export type MailConfig = {
  /** 开启后读者能看到订阅框，新教程发布时自动通知 */
  enabled: boolean;
  host: string;
  port: number;
  /** true：直接 TLS（通常 465 端口）；false：明文连接后按服务器支持升级 STARTTLS（通常 587/25） */
  secure: boolean;
  user: string;
  pass: string;
  fromName: string;
  fromEmail: string;
};

export const emptyMailConfig: MailConfig = {
  enabled: false,
  host: "",
  port: 465,
  secure: true,
  user: "",
  pass: "",
  fromName: "",
  fromEmail: "",
};

/** 配置齐全（能发信）；enabled 决定读者是否看得到订阅框。 */
export function mailConfigComplete(config: MailConfig) {
  return Boolean(config.host && config.port && config.fromEmail);
}

export function validateMailConfig(config: MailConfig): string | null {
  if (!config.enabled && !config.host) return null;
  if (!/^[a-z0-9.-]+$/i.test(config.host)) return "SMTP 服务器请填写域名或 IP，例如 smtpdm.aliyun.com";
  if (!Number.isInteger(config.port) || config.port < 1 || config.port > 65535) return "端口不对（常见是 465 或 587）";
  if (!normalizeEmail(config.fromEmail)) return "发件人邮箱格式不对";
  if (config.fromName.length > 40) return "发件人名称最多 40 个字";
  return null;
}

/** 解析存储的 JSON，缺字段或类型不对时用默认值。 */
export function readMailConfig(raw: unknown): MailConfig {
  const value = (raw && typeof raw === "object" ? raw : {}) as Partial<Record<keyof MailConfig, unknown>>;
  const str = (input: unknown) => (typeof input === "string" ? input : "");
  return {
    enabled: value.enabled === true,
    host: str(value.host),
    port: typeof value.port === "number" ? value.port : emptyMailConfig.port,
    secure: typeof value.secure === "boolean" ? value.secure : emptyMailConfig.secure,
    user: str(value.user),
    pass: str(value.pass),
    fromName: str(value.fromName),
    fromEmail: str(value.fromEmail),
  };
}

type TokenPurpose = "confirm" | "unsubscribe";

function tokenKey() {
  const secret = authSecretFrom();
  if (!secret) throw new Error("生产环境必须设置随机的 AUTH_SECRET");
  return secret;
}

function mac(id: number, purpose: TokenPurpose) {
  return createHmac("sha256", tokenKey()).update(`subscription:${purpose}:${id}`).digest("base64url").slice(0, 32);
}

/** 确认 / 退订链接里的口令：订阅者 id + HMAC，不用存库；退订后行被删掉，旧链接自然失效。 */
export function signSubscriberToken(id: number, purpose: TokenPurpose) {
  return `${id}.${mac(id, purpose)}`;
}

export function readSubscriberToken(token: unknown, purpose: TokenPurpose): number | null {
  if (typeof token !== "string") return null;
  const match = /^(\d{1,12})\.([\w-]{32})$/.exec(token);
  if (!match) return null;
  const id = Number(match[1]);
  const expected = Buffer.from(mac(id, purpose));
  const actual = Buffer.from(match[2]);
  return expected.length === actual.length && timingSafeEqual(expected, actual) ? id : null;
}

const escapeHtml = (text: string) =>
  text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

type Email = { subject: string; text: string; html: string };

/** 邮件文案：调用方传网站语言的 m.email（不传时用简体中文，测试用） */
type EmailText = typeof zhEmail;

function layout(siteName: string, body: string, footer: string, locale: Locale) {
  return `<!doctype html><html lang="${locale}"><body style="margin:0;background:#f7f8fa;font-family:-apple-system,BlinkMacSystemFont,'PingFang SC','Microsoft YaHei',sans-serif;color:#17181c">
<div style="max-width:560px;margin:0 auto;padding:32px 20px">
<p style="margin:0 0 16px;font-size:14px;color:#6b7280">${escapeHtml(siteName)}</p>
<div style="background:#fff;border:1px solid #e9ebf0;border-radius:16px;padding:28px">${body}</div>
<p style="margin:16px 0 0;font-size:12px;line-height:1.6;color:#6b7280">${footer}</p>
</div></body></html>`;
}

const button = (url: string, label: string) =>
  `<a href="${escapeHtml(url)}" style="display:inline-block;margin-top:20px;background:#17181c;color:#fff;text-decoration:none;padding:10px 20px;border-radius:999px;font-size:14px">${escapeHtml(label)}</a>`;

export function confirmEmail({
  siteName,
  confirmUrl,
  t = zhEmail,
  locale = "zh-CN",
}: {
  siteName: string;
  confirmUrl: string;
  t?: EmailText;
  locale?: Locale;
}): Email {
  return {
    subject: format(t.confirmSubject, { site: siteName }),
    text: format(t.confirmText, { site: siteName, url: confirmUrl }),
    html: layout(
      siteName,
      `<h1 style="margin:0;font-size:20px">${escapeHtml(t.confirmHeading)}</h1>
<p style="margin:12px 0 0;font-size:15px;line-height:1.7;color:#4b5563">${escapeHtml(format(t.confirmBody, { site: siteName }))}</p>
${button(confirmUrl, t.confirmButton)}`,
      escapeHtml(t.confirmFooter),
      locale,
    ),
  };
}

export function newTutorialEmail({
  siteName,
  title,
  excerpt,
  url,
  unsubscribeUrl,
  t = zhEmail,
  locale = "zh-CN",
}: {
  siteName: string;
  title: string;
  excerpt: string | null;
  url: string;
  unsubscribeUrl: string;
  t?: EmailText;
  locale?: Locale;
}): Email {
  const summary = excerpt?.trim() ?? "";
  const link = `<a href="${escapeHtml(unsubscribeUrl)}" style="color:#6b7280">${escapeHtml(t.unsubscribeLink)}</a>`;
  return {
    subject: format(t.newSubject, { title }),
    text: `${format(t.newIntro, { site: siteName })}\n\n${title}\n${summary ? `\n${summary}\n` : ""}\n${format(t.newReadMore, { url })}\n\n${format(t.newUnsubscribe, { url: unsubscribeUrl })}`,
    html: layout(
      siteName,
      `<p style="margin:0;font-size:13px;color:#4f46e5">${escapeHtml(t.newLabel)}</p>
<h1 style="margin:8px 0 0;font-size:20px;line-height:1.4">${escapeHtml(title)}</h1>
${summary ? `<p style="margin:12px 0 0;font-size:15px;line-height:1.7;color:#4b5563">${escapeHtml(summary)}</p>` : ""}
${button(url, t.newButton)}`,
      escapeHtml(format(t.newFooter, { site: siteName, link: "\u0000" })).replace("\u0000", link),
      locale,
    ),
  };
}
