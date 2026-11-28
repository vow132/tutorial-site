"use server";

import { revalidatePath } from "next/cache";
import { confirmCurrentPassword, requireSession } from "@/lib/admin-auth";
import { validateAlertConfig, type AlertChannel, type AlertConfig } from "@/lib/alert-transport.mjs";
import { alertSite, getAlertConfig, notifyInBackground, notifyNow, saveAlertConfig } from "@/lib/alerts";
import { getAdminI18n } from "@/lib/i18n/server";
import type { Messages } from "@/lib/i18n/messages";
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

const channelLabel = (channel: AlertChannel, m: Messages) => m.admin.alertChannels[channel] ?? channel;

function problemText(problem: NonNullable<ReturnType<typeof validateAlertConfig>>, channel: AlertChannel, m: Messages) {
  return m.admin.alertsForm.invalid[problem].replace("{channel}", channelLabel(channel, m));
}

/** 保存告警设置。改推送目标需要当前密码：防止会话被盗后被人悄悄关掉告警。 */
export async function saveAlertSettings(_prev: AlertFormState, formData: FormData): Promise<AlertFormState> {
  const { admin } = await requireSession();
  const { m } = await getAdminI18n();
  const passwordError = await confirmCurrentPassword(admin, String(formData.get("currentPassword") ?? ""));
  if (passwordError) return { error: passwordError };

  const previous = await getAlertConfig();
  const next = await configFromForm(formData);
  const problem = validateAlertConfig(next);
  if (problem) return { error: problemText(problem, next.channel, m) };

  const targetChanged =
    previous.channel !== next.channel ||
    previous.url !== next.url ||
    previous.telegramChatId !== next.telegramChatId ||
    previous.telegramToken !== next.telegramToken;
  // 先通知旧渠道：如果不是本人改的，原来的接收人还能收到这条消息。
  if (previous.channel !== "off" && targetChanged) {
    // 推送内容跟网站语言（lib/alerts.ts 的 alertSite()）
    const site = (await alertSite()).m;
    const t = site.admin.alerts;
    await notifyInBackground(
      "alerts.update",
      t.titles.alertsUpdate,
      [t.account.replace("{name}", admin.username), t.newChannel.replace("{channel}", channelLabel(next.channel, site)), t.checkNow],
      previous,
    );
  }

  await saveAlertConfig(next);
  await audit("alerts.update", { actor: admin.username, detail: channelLabel(next.channel, m) });
  revalidatePath("/admin/account");
  return { success: next.channel === "off" ? m.admin.alertsForm.off : m.admin.alertsForm.saved };
}

/** 用表单当前的配置发一条测试消息（不保存）。 */
export async function sendTestAlert(_prev: AlertFormState, formData: FormData): Promise<AlertFormState> {
  const { admin } = await requireSession();
  const { m, f } = await getAdminI18n();
  const config = await configFromForm(formData);
  if (config.channel === "off") return { error: m.admin.alertsForm.chooseChannel };
  const problem = validateAlertConfig(config);
  if (problem) return { error: problemText(problem, config.channel, m) };
  try {
    const t = (await alertSite()).m.admin.alerts;
    await notifyNow("alerts.test", t.titles.test, [t.operator.replace("{name}", admin.username)], config);
    return { success: m.admin.alertsForm.testSent };
  } catch (error) {
    return { error: f(m.admin.alertsForm.sendFailed, { reason: error instanceof Error ? error.message : String(error) }) };
  }
}
