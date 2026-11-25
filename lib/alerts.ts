import { prisma } from "@/lib/prisma";
import { describeAgent } from "@/lib/user-agent";
import {
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
 * 直接读数据库里的站名，不走站点设置的 Next 缓存：
 * 备份检查等任务在请求之外的定时器里运行，那里没有 Next 的缓存上下文。
 */
async function siteName() {
  const row = await prisma.setting.findUnique({ where: { key: "site" } });
  try {
    return (row ? (JSON.parse(row.value) as { siteName?: string }).siteName : undefined) || "教程网";
  } catch {
    return "教程网";
  }
}

export async function updateAlertStatus(patch: AlertStatus) {
  const value = JSON.stringify({ ...(await getAlertStatus()), ...patch });
  await prisma.setting.upsert({
    where: { key: ALERT_STATUS_KEY },
    update: { value },
    create: { key: ALERT_STATUS_KEY, value },
  });
}

async function deliver(target: AlertConfig, site: string, event: string, title: string, lines: string[]) {
  try {
    await sendAlert(target, { site, event, title, lines: [...lines, `时间：${formatAlertTime()}`] });
    await updateAlertStatus({ lastAt: new Date().toISOString(), lastOk: true, lastTitle: title, lastError: undefined });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
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
  await deliver(target, await siteName(), event, title, lines);
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
    const site = await siteName();
    void deliver(target, site, event, title, lines).catch(() => {});
  } catch (error) {
    console.error("[alerts] 读取告警配置失败：", error);
  }
}

const NOT_ME = "如果不是你本人操作，请立即到后台「账号安全」退出所有设备并修改密码；无法登录时在服务器上运行 npm run admin:reset。";

/**
 * 审计日志里的哪些动作需要实时推送（lib/audit.ts 写完日志后调用）。
 * 返回 null 表示该动作不推送。
 */
export function alertForAudit(
  action: string,
  context: { actor?: string | null; detail?: string | null; ip?: string | null; userAgent?: string | null },
): { title: string; lines: string[] } | null {
  const who = [
    `账号：${context.actor ?? "未知"}`,
    `IP：${context.ip ?? "未知（未配置 TRUST_PROXY）"}`,
    `设备：${describeAgent(context.userAgent)}`,
  ];
  switch (action) {
    case "login.success":
      return context.detail?.startsWith("新设备") ? { title: "新设备登录了后台", lines: [...who, NOT_ME] } : null;
    case "login.locked":
      return {
        title: "后台登录因多次失败已被临时锁定",
        lines: [`范围：${context.detail ?? "未知"}`, `最后一次尝试的用户名：${context.actor ?? "未知"}`, `IP：${context.ip ?? "未知（未配置 TRUST_PROXY）"}`, "可能有人在猜密码；如果是你自己输错，等锁定结束即可。"],
      };
    case "account.update":
      return { title: "管理员账号信息被修改", lines: [...who, `修改内容：${context.detail ?? "—"}`, NOT_ME] };
    case "totp.enable":
      return { title: "两步验证已开启", lines: who };
    case "totp.disable":
      return { title: "两步验证已被关闭", lines: [...who, NOT_ME] };
    case "passkey.add":
      return { title: "添加了新的通行密钥", lines: [...who, `名称：${context.detail ?? "—"}`, NOT_ME] };
    case "login.recovery_code":
      return {
        title: "有人用恢复码登录了后台",
        lines: [...who, `恢复码：${context.detail ?? "—"}`, "恢复码只在手机丢失时使用；如果不是你本人，请立即重新生成恢复码并修改密码。"],
      };
    case "recovery_codes.regenerate":
      return { title: "两步验证恢复码已重新生成", lines: [...who, "旧的恢复码已全部作废。", NOT_ME] };
    case "passkey.remove":
      return { title: "删除了通行密钥", lines: [...who, `名称：${context.detail ?? "—"}`] };
    case "mail.settings":
      return { title: "邮件订阅的发信设置被修改", lines: [...who, `内容：${context.detail ?? "—"}`, NOT_ME] };
    case "user.create":
      return { title: "新建了后台账号", lines: [...who, `新账号：${context.detail ?? "—"}`, NOT_ME] };
    case "user.update":
      return context.detail?.includes("角色") ? { title: "后台账号的角色被修改", lines: [...who, `修改内容：${context.detail}`, NOT_ME] } : null;
    case "user.reset":
      return { title: "有人重置了另一个后台账号的密码", lines: [...who, `被重置的账号：${context.detail ?? "—"}`, NOT_ME] };
    case "user.delete":
      return { title: "删除了后台账号", lines: [...who, `内容：${context.detail ?? "—"}`, NOT_ME] };
    case "setup.complete":
      return { title: "网站完成了首次安装", lines: [...who, "站长账号已在安装页面创建。", NOT_ME] };
    default:
      return null;
  }
}
