"use server";

import { revalidatePath } from "next/cache";
import { confirmCurrentPassword, requireSession } from "@/lib/admin-auth";
import { ALERT_CHANNELS, validateAlertConfig, type AlertChannel, type AlertConfig } from "@/lib/alert-transport.mjs";
import { getAlertConfig, notifyInBackground, notifyNow, saveAlertConfig } from "@/lib/alerts";
import { audit } from "@/lib/audit";

export type AlertFormState = { error?: string; success?: string };

/** 表单里的密钥留空表示「保持不变」，这样页面上不需要回显已保存的密钥。 */
async function configFromForm(formData: FormData): Promise<AlertConfig> {
  const saved = await getAlertConfig();
  const text = (key: string) => String(formData.get(key) ?? "").trim();
  const channel = text("channel") as AlertChannel;
  const keep = (value: string, previous: string | undefined) =>
    value || (saved.channel === channel ? previous : undefined);
  return {
    channel,
    url: channel === "telegram" || channel === "off" ? undefined : text("url") || undefined,
    secret: channel === "dingtalk" || channel === "feishu" ? keep(text("secret"), saved.secret) : undefined,
    telegramToken: channel === "telegram" ? keep(text("telegramToken"), saved.telegramToken) : undefined,
    telegramChatId: channel === "telegram" ? text("telegramChatId") || undefined : undefined,
    backupReminder: formData.get("backupReminder") === "on",
  };
}

const channelLabel = (channel: AlertChannel) =>
  ALERT_CHANNELS.find((item) => item.value === channel)?.label ?? channel;

/** 保存告警设置。改推送目标需要当前密码：防止会话被盗后被人悄悄关掉告警。 */
export async function saveAlertSettings(_prev: AlertFormState, formData: FormData): Promise<AlertFormState> {
  const { admin } = await requireSession();
  const passwordError = await confirmCurrentPassword(admin, String(formData.get("currentPassword") ?? ""));
  if (passwordError) return { error: passwordError };

  const previous = await getAlertConfig();
  const next = await configFromForm(formData);
  const problem = validateAlertConfig(next);
  if (problem) return { error: problem };

  const targetChanged =
    previous.channel !== next.channel ||
    previous.url !== next.url ||
    previous.telegramChatId !== next.telegramChatId ||
    previous.telegramToken !== next.telegramToken;
  // 先通知旧渠道：如果不是本人改的，原来的接收人还能收到这条消息。
  if (previous.channel !== "off" && targetChanged) {
    await notifyInBackground(
      "alerts.update",
      "告警推送设置被修改",
      [`账号：${admin.username}`, `新的推送渠道：${channelLabel(next.channel)}`, "如果不是你本人操作，请立即登录后台检查。"],
      previous,
    );
  }

  await saveAlertConfig(next);
  await audit("alerts.update", { actor: admin.username, detail: channelLabel(next.channel) });
  revalidatePath("/admin/account");
  return {
    success: next.channel === "off" ? "已关闭安全告警" : "已保存，建议点「发送测试消息」确认能收到",
  };
}

/** 用表单当前的配置发一条测试消息（不保存）。 */
export async function sendTestAlert(_prev: AlertFormState, formData: FormData): Promise<AlertFormState> {
  const { admin } = await requireSession();
  const config = await configFromForm(formData);
  if (config.channel === "off") return { error: "请先选择推送渠道" };
  const problem = validateAlertConfig(config);
  if (problem) return { error: problem };
  try {
    await notifyNow("alerts.test", "测试消息：安全告警推送正常", [`操作人：${admin.username}`], config);
    return { success: "测试消息已发出，请到群里或 Telegram 查看" };
  } catch (error) {
    return { error: `发送失败：${error instanceof Error ? error.message : String(error)}` };
  }
}
