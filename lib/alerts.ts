import { prisma } from "@/lib/prisma";
import { describeAgent } from "@/lib/user-agent";
import { format } from "@/lib/i18n/format";
import { INTL_LOCALE, readLocale, type Locale } from "@/lib/i18n/locales";
import { messagesFor, type Messages } from "@/lib/i18n/messages";
import {
  AlertSendError,
  ALERT_SETTING_KEY,
  ALERT_STATUS_KEY,
  formatAlertTime,
  parseAlertConfig,
  sendAlert,
  serializeAlertConfig,
  type AlertConfig,
} from "@/lib/alert-transport.mjs";

export type AlertStatus = {
  lastAt?: string;
  lastOk?: boolean;
  lastTitle?: string;
  lastError?: string;
  /** 上次「备份过期」提醒的时间，避免每次检查都推送。 */
  backupReminderAt?: string;
};

export async function getAlertConfig(): Promise<AlertConfig> {
  const row = await prisma.setting.findUnique({ where: { key: ALERT_SETTING_KEY } });
  return parseAlertConfig(row?.value);
}

export async function saveAlertConfig(config: AlertConfig) {
  const value = serializeAlertConfig(config);
  await prisma.setting.upsert({
    where: { key: ALERT_SETTING_KEY },
    update: { value },
    create: { key: ALERT_SETTING_KEY, value },
  });
}

export async function getAlertStatus(): Promise<AlertStatus> {
  const row = await prisma.setting.findUnique({ where: { key: ALERT_STATUS_KEY } });
  try {
    return row ? (JSON.parse(row.value) as AlertStatus) : {};
  } catch {
    return {};
  }
}

/**
 * 直接读数据库里的站名和网站语言，不走站点设置的 Next 缓存：
 * 备份检查等任务在请求之外的定时器里运行，那里没有 Next 的缓存上下文。
 * 告警推送的文字跟网站语言（几个站长共用一个推送渠道，不按个人的后台语言）。
 */
export async function alertSite(): Promise<{ name: string; locale: Locale; m: Messages }> {
  const row = await prisma.setting.findUnique({ where: { key: "site" } });
  let parsed: { siteName?: unknown; locale?: unknown } = {};
  try {
    parsed = row ? JSON.parse(row.value) : {};
  } catch {
    // 设置损坏时用默认值
  }
  const locale = readLocale(parsed.locale);
  const m = messagesFor(locale);
  return { name: (typeof parsed.siteName === "string" && parsed.siteName) || m.defaults.siteName, locale, m };
}

export async function updateAlertStatus(patch: AlertStatus) {
  const value = JSON.stringify({ ...(await getAlertStatus()), ...patch });
  await prisma.setting.upsert({
    where: { key: ALERT_STATUS_KEY },
    update: { value },
    create: { key: ALERT_STATUS_KEY, value },
  });
}

type Site = Awaited<ReturnType<typeof alertSite>>;

async function deliver(target: AlertConfig, site: Site, event: string, title: string, lines: string[]) {
  const t = site.m.admin.alerts;
  try {
    const time = format(t.time, { time: formatAlertTime(new Date(), INTL_LOCALE[site.locale]) });
    await sendAlert(target, { site: site.name, event, title, lines: [...lines, time] });
    await updateAlertStatus({ lastAt: new Date().toISOString(), lastOk: true, lastTitle: title, lastError: undefined });
  } catch (cause) {
    const message =
      cause instanceof AlertSendError ? format(t.errors[cause.code], { detail: cause.detail }) : cause instanceof Error ? cause.message : String(cause);
    const error = new Error(message);
    console.error(`[alerts] ${title} 推送失败：${message}`);
    await updateAlertStatus({
      lastAt: new Date().toISOString(),
      lastOk: false,
      lastTitle: title,
      lastError: message.slice(0, 300),
    }).catch(() => {});
    throw error;
  }
}

/**
 * 发送一条告警并等待结果（后台「发送测试消息」用）；失败时抛出带原因的错误。
 * `config` 省略时读取已保存的配置。
 */
export async function notifyNow(event: string, title: string, lines: string[], config?: AlertConfig) {
  const target = config ?? (await getAlertConfig());
  if (target.channel === "off") return false;
  await deliver(target, await alertSite(), event, title, lines);
  return true;
}

/**
 * 在请求内读取配置和站名，网络推送放到后台进行：安全告警不能拖慢或打断登录等业务。
 * 推送失败只记录到「上次推送状态」和服务器日志。
 */
export async function notifyInBackground(event: string, title: string, lines: string[], config?: AlertConfig) {
  try {
    const target = config ?? (await getAlertConfig());
    if (target.channel === "off") return;
    const site = await alertSite();
    void deliver(target, site, event, title, lines).catch(() => {});
  } catch (error) {
    console.error("[alerts] 读取告警配置失败：", error);
  }
}

/** 审计日志写入时带的上下文；alert 指明这一条要不要推送（新设备登录、改了角色这类按情况决定的动作） */
export type AuditContext = { actor?: string | null; detail?: string | null; ip?: string | null; userAgent?: string | null; alert?: boolean };

/**
 * 审计日志里的哪些动作需要实时推送（lib/audit.ts 写完日志后调用）。
 * 返回 null 表示该动作不推送。m 是网站语言的文案（alertSite()）。
 */
export function alertForAudit(action: string, context: AuditContext, m: Messages): { title: string; lines: string[] } | null {
  const t = m.admin.alerts;
  const titles = t.titles;
  const value = (text: string, v: string | null | undefined) => format(text, { value: v ?? "—" });
  const ip = context.ip ?? t.ipUnknown;
  const who = [
    format(t.account, { name: context.actor ?? t.unknown }),
    format(t.ip, { ip }),
    format(t.device, { device: describeAgent(context.userAgent, m.admin.account) }),
  ];
  switch (action) {
    case "login.success":
      return context.alert ? { title: titles.newDevice, lines: [...who, t.notMe] } : null;
    case "login.locked":
      return {
        title: titles.locked,
        lines: [value(t.scope, context.detail ?? t.unknown), value(t.lastUsername, context.actor ?? t.unknown), format(t.ip, { ip }), t.lockedHint],
      };
    case "account.update":
      return { title: titles.accountUpdate, lines: [...who, value(t.changes, context.detail), t.notMe] };
    case "totp.enable":
      return { title: titles.totpEnable, lines: who };
    case "totp.disable":
      return { title: titles.totpDisable, lines: [...who, t.notMe] };
    case "passkey.add":
      return { title: titles.passkeyAdd, lines: [...who, value(t.name, context.detail), t.notMe] };
    case "login.recovery_code":
      return { title: titles.recoveryLogin, lines: [...who, value(t.recoveryCode, context.detail), t.recoveryHint] };
    case "recovery_codes.regenerate":
      return { title: titles.recoveryRegenerate, lines: [...who, t.recoveryOld, t.notMe] };
    case "passkey.remove":
      return { title: titles.passkeyRemove, lines: [...who, value(t.name, context.detail)] };
    case "mail.settings":
      return { title: titles.mailSettings, lines: [...who, value(t.content, context.detail), t.notMe] };
    case "turnstile.settings":
      return { title: titles.turnstileSettings, lines: [...who, value(t.content, context.detail), t.notMe] };
    case "user.create":
      return { title: titles.userCreate, lines: [...who, value(t.newAccount, context.detail), t.notMe] };
    case "user.update":
      return context.alert ? { title: titles.userRole, lines: [...who, value(t.changes, context.detail), t.notMe] } : null;
    case "user.reset":
      return { title: titles.userReset, lines: [...who, value(t.resetAccount, context.detail), t.notMe] };
    case "user.delete":
      return { title: titles.userDelete, lines: [...who, value(t.content, context.detail), t.notMe] };
    case "setup.complete":
      return { title: titles.setup, lines: [...who, t.setupHint, t.notMe] };
    default:
      return null;
  }
}
