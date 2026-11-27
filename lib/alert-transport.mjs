/**
 * 安全告警推送：钉钉 / 飞书 / 企业微信 / Telegram / 通用 Webhook。
 *
 * 纯 JS（.mjs）是为了让网站本身（lib/alerts.ts）和独立运行的脚本
 * （scripts/backup.mjs、scripts/site-update.mjs）共用同一份实现。
 * 配置存在 Setting 表 key="alerts" 的 JSON 里，与公开的站点设置分开，
 * 密钥不会进入任何前台页面。
 */
import { createHmac } from "node:crypto";
import { ALERT_CHANNELS } from "./alert-channels.mjs";
import { isSealed, openSecret, sealSecret } from "./secret-box.mjs";

export { ALERT_CHANNELS };

/**
 * @typedef {import("./alert-channels.mjs").AlertChannel} AlertChannel
 * @typedef {{
 *   channel: AlertChannel,
 *   url?: string,
 *   secret?: string,
 *   telegramToken?: string,
 *   telegramChatId?: string,
 *   backupReminder?: boolean,
 *   locked?: boolean,
 * }} AlertConfig
 * @typedef {{ site: string, event: string, title: string, lines?: string[] }} AlertMessage
 */

export const ALERT_SETTING_KEY = "alerts";
export const ALERT_STATUS_KEY = "alerts:status";

/** 各平台机器人地址的固定域名：只允许发往这些地址，防止被改成内网地址做 SSRF。 */
const CHANNEL_HOSTS = {
  dingtalk: ["oapi.dingtalk.com"],
  feishu: ["open.feishu.cn", "open.larksuite.com"],
  wecom: ["qyapi.weixin.qq.com"],
};

function parseUrl(value) {
  try {
    return new URL(value);
  } catch {
    return null;
  }
}

/**
 * 校验配置；返回哪一项不对（文字按后台语言：m.admin.alertsForm.invalid），合法时返回 null。
 * @param {AlertConfig} config
 * @returns {"channel" | "telegramToken" | "telegramChatId" | "url" | "https" | "host" | null}
 */
export function validateAlertConfig(config) {
  const channel = config.channel;
  if (!ALERT_CHANNELS.some((item) => item.value === channel)) return "channel";
  if (channel === "off") return null;
  if (channel === "telegram") {
    if (!/^\d{5,}:[\w-]{20,}$/.test(config.telegramToken ?? "")) return "telegramToken";
    if (!/^(-?\d{3,}|@[\w]{5,})$/.test(config.telegramChatId ?? "")) return "telegramChatId";
    return null;
  }
  const url = parseUrl(config.url ?? "");
  if (!url) return "url";
  if (channel === "webhook") {
    const local = url.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
    if (url.protocol !== "https:" && !local) return "https";
    return null;
  }
  if (url.protocol !== "https:" || !CHANNEL_HOSTS[channel].includes(url.hostname)) return "host";
  return null;
}

/**
 * 推送失败。code：off（没开启）/ unreachable（连不上）/ http（返回非 2xx）/ rejected（平台拒绝，如钉钉关键词不匹配）。
 * 文字按语言在 lib/alerts.ts 里换（m.admin.alerts.errors）；独立脚本直接打印 message。
 */
export class AlertSendError extends Error {
  /**
   * @param {"off" | "unreachable" | "http" | "rejected"} code
   * @param {string} [detail]
   */
  constructor(code, detail = "") {
    super(detail ? `${code}: ${detail}` : code);
    this.code = code;
    this.detail = detail;
  }
}

/** 配置整体加密后存库（含 Webhook 地址、签名密钥、Bot Token）。 */
const ALERT_PURPOSE = "alerts";

/**
 * 存库前加密配置。
 * @param {AlertConfig} config
 * @param {Record<string, string | undefined>} [env]
 */
export function serializeAlertConfig(config, env = process.env) {
  const stored = { ...config };
  delete stored.locked;
  return sealSecret(JSON.stringify(stored), ALERT_PURPOSE, env);
}

/**
 * 从数据库读出配置（兼容加密前的明文 JSON）；缺失或损坏时视为关闭。
 * 解不开（加密密钥已更换）时同样视为关闭，并带上 locked 标记，后台据此提示重新填写。
 * @param {string | null | undefined} raw
 * @param {Record<string, string | undefined>} [env]
 * @returns {AlertConfig}
 */
export function parseAlertConfig(raw, env = process.env) {
  let json = raw;
  if (isSealed(raw)) {
    try {
      json = openSecret(/** @type {string} */ (raw), ALERT_PURPOSE, env);
    } catch {
      return { channel: "off", locked: true };
    }
  }
  try {
    const value = json ? JSON.parse(json) : null;
    if (!value || typeof value !== "object") return { channel: "off" };
    /** @type {AlertConfig} */
    const config = {
      channel: typeof value.channel === "string" ? value.channel : "off",
      url: typeof value.url === "string" ? value.url : undefined,
      secret: typeof value.secret === "string" ? value.secret : undefined,
      telegramToken: typeof value.telegramToken === "string" ? value.telegramToken : undefined,
      telegramChatId: typeof value.telegramChatId === "string" ? value.telegramChatId : undefined,
      backupReminder: value.backupReminder !== false,
    };
    return validateAlertConfig(config) ? { channel: "off", backupReminder: config.backupReminder } : config;
  } catch {
    return { channel: "off" };
  }
}

/** 告警里的时间统一按 ALERT_TIMEZONE（默认北京时间）显示，服务器时区设成 UTC 也不影响。 */
export function formatAlertTime(date = new Date(), locale = "zh-CN") {
  const timeZone = process.env.ALERT_TIMEZONE || "Asia/Shanghai";
  try {
    return `${date.toLocaleString(locale, { timeZone, hour12: false })} (${timeZone})`;
  } catch {
    return date.toISOString();
  }
}

/** @param {AlertMessage} message */
export function formatAlertText(message) {
  return [`【${message.site}】${message.title}`, ...(message.lines ?? [])].join("\n");
}

function sign(key, data) {
  return createHmac("sha256", key).update(data).digest("base64");
}

/**
 * 构造请求（纯函数，便于测试）。
 * @param {AlertConfig} config
 * @param {AlertMessage} message
 * @param {number} [now]
 * @returns {{ url: string, body: Record<string, unknown> }}
 */
export function buildAlertRequest(config, message, now = Date.now()) {
  const text = formatAlertText(message);
  switch (config.channel) {
    case "dingtalk": {
      const url = new URL(config.url);
      if (config.secret) {
        // 钉钉「加签」：HmacSHA256(secret, `${毫秒时间戳}\n${secret}`) 的 Base64。
        url.searchParams.set("timestamp", String(now));
        url.searchParams.set("sign", sign(config.secret, `${now}\n${config.secret}`));
      }
      return { url: url.toString(), body: { msgtype: "text", text: { content: text } } };
    }
    case "feishu": {
      const body = { msg_type: "text", content: { text } };
      if (config.secret) {
        // 飞书「签名校验」：以 `${秒级时间戳}\n${secret}` 为密钥对空串做 HmacSHA256。
        const timestamp = String(Math.floor(now / 1000));
        Object.assign(body, { timestamp, sign: sign(`${timestamp}\n${config.secret}`, "") });
      }
      return { url: config.url, body };
    }
    case "wecom":
      return { url: config.url, body: { msgtype: "text", text: { content: text } } };
    case "telegram":
      return {
        url: `https://api.telegram.org/bot${config.telegramToken}/sendMessage`,
        body: { chat_id: config.telegramChatId, text, disable_web_page_preview: true },
      };
    case "webhook":
      return {
        url: config.url,
        body: {
          event: message.event,
          site: message.site,
          title: message.title,
          lines: message.lines ?? [],
          text,
          time: new Date(now).toISOString(),
        },
      };
    default:
      throw new AlertSendError("off");
  }
}

/** 各平台 HTTP 200 也可能是业务失败（如钉钉关键词不匹配），要看返回体。 */
function businessError(channel, data) {
  if (!data || typeof data !== "object") return null;
  if ((channel === "dingtalk" || channel === "wecom") && data.errcode !== 0) {
    return `${data.errcode} ${data.errmsg ?? ""}`.trim();
  }
  if (channel === "feishu") {
    const code = data.code ?? data.StatusCode;
    if (code !== 0) return `${code} ${data.msg ?? data.StatusMessage ?? ""}`.trim();
  }
  if (channel === "telegram" && data.ok !== true) return data.description ?? "Telegram error";
  return null;
}

/**
 * 发送一条告警；失败时抛出带原因的 Error（调用方决定是否吞掉）。
 * @param {AlertConfig} config
 * @param {AlertMessage} message
 * @param {{ fetchImpl?: typeof fetch, timeoutMs?: number }} [options]
 */
export async function sendAlert(config, message, { fetchImpl = fetch, timeoutMs = 8000 } = {}) {
  const { url, body } = buildAlertRequest(config, message);
  let response;
  try {
    response = await fetchImpl(url, {
      method: "POST",
      headers: { "Content-Type": "application/json; charset=utf-8" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
      redirect: "error",
    });
  } catch (error) {
    throw new AlertSendError("unreachable", error instanceof Error ? error.message : String(error));
  }
  const textBody = await response.text().catch(() => "");
  if (!response.ok) throw new AlertSendError("http", `${response.status} ${textBody.slice(0, 120)}`.trim());
  if (config.channel === "webhook") return;
  let data = null;
  try {
    data = JSON.parse(textBody);
  } catch {
    // 非 JSON 返回按成功处理
  }
  const problem = businessError(config.channel, data);
  if (problem) throw new AlertSendError("rejected", problem);
}

/**
 * 供独立脚本使用：从 SQLite 读取配置并发送，任何错误都只打印、不抛出。
 * @param {{ prepare: (sql: string) => { get: (...args: unknown[]) => any } }} db better-sqlite3 实例
 * @param {Omit<AlertMessage, "site">} message
 */
export async function notifyFromDatabase(db, message) {
  try {
    const row = db.prepare('SELECT "value" FROM "Setting" WHERE "key" = ?').get(ALERT_SETTING_KEY);
    const config = parseAlertConfig(row?.value);
    if (config.channel === "off") return false;
    const siteRow = db.prepare('SELECT "value" FROM "Setting" WHERE "key" = ?').get("site");
    let site = "教程网";
    try {
      site = JSON.parse(siteRow?.value ?? "{}").siteName || site;
    } catch {
      // 设置损坏时用默认站名
    }
    await sendAlert(config, { ...message, site, lines: [...(message.lines ?? []), `时间：${formatAlertTime()}`] });
    return true;
  } catch (error) {
    console.error("[alerts] 推送失败：", error instanceof Error ? error.message : error);
    return false;
  }
}
