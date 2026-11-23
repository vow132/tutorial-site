"use server";

import { revalidatePath, revalidateTag } from "next/cache";
import { requireAuth } from "@/lib/admin-auth";
import { audit } from "@/lib/audit";
import { getMailConfig, saveMailConfig, sendOne } from "@/lib/mail";
import { prisma } from "@/lib/prisma";
import { CACHE_TAGS } from "@/lib/public-data";
import { getSettings } from "@/lib/settings";
import { mailConfigComplete, maskEmail, normalizeEmail, validateMailConfig, type MailConfig } from "@/lib/subscription";

export type MailFormState = { error?: string; success?: string };

/** 保存发信配置。密码框留空表示不修改（页面不回显已保存的密码）。 */
export async function saveMailSettings(_prev: MailFormState, formData: FormData): Promise<MailFormState> {
  const admin = await requireAuth();
  const text = (key: string) => String(formData.get(key) ?? "").trim();
  const current = await getMailConfig();
  const pass = String(formData.get("pass") ?? "");
  const config: MailConfig = {
    enabled: formData.get("enabled") === "on",
    host: text("host"),
    port: Number(text("port")) || 0,
    secure: formData.get("secure") === "on",
    user: text("user"),
    pass: pass || (formData.get("clearPass") === "on" ? "" : current.pass),
    fromName: text("fromName"),
    fromEmail: text("fromEmail").toLowerCase(),
  };
  if (config.enabled && !mailConfigComplete(config)) return { error: "开启前请填好 SMTP 服务器、端口和发件人邮箱" };
  const error = validateMailConfig(config);
  if (error) return { error };
  await saveMailConfig(config);
  await audit("mail.settings", {
    actor: admin.username,
    detail: `${config.enabled ? "开启" : "关闭"}邮件订阅；SMTP ${config.host || "未填写"}:${config.port}；发件人 ${config.fromEmail || "未填写"}`,
  });
  // 前台订阅框是否显示跟着变（文章页、页脚）
  revalidateTag(CACHE_TAGS.settings, { expire: 0 });
  revalidatePath("/", "layout");
  return { success: config.enabled ? "已保存，读者现在能看到订阅框了" : "已保存（邮件订阅未开启）" };
}

/** 用当前保存的配置发一封测试邮件。 */
export async function sendTestMail(_prev: MailFormState, formData: FormData): Promise<MailFormState> {
  await requireAuth();
  const to = normalizeEmail(formData.get("to"));
  if (!to) return { error: "请填写收件邮箱" };
  const config = await getMailConfig();
  if (!mailConfigComplete(config)) return { error: "请先保存 SMTP 服务器、端口和发件人邮箱" };
  const { siteName } = await getSettings();
  try {
    await sendOne(config, siteName, {
      to,
      subject: `「${siteName}」测试邮件`,
      text: "收到这封邮件说明发信设置是对的。",
      html: "<p>收到这封邮件说明发信设置是对的。</p>",
    });
  } catch (reason) {
    return { error: `发送失败：${reason instanceof Error ? reason.message : String(reason)}` };
  }
  return { success: `已发送到 ${to}，请查收（也看看垃圾邮件）` };
}

export async function deleteSubscriber(formData: FormData) {
  const admin = await requireAuth();
  const id = Number(formData.get("id"));
  const subscriber = id ? await prisma.subscriber.findUnique({ where: { id } }) : null;
  if (!subscriber) return;
  await prisma.subscriber.delete({ where: { id } });
  await audit("subscriber.delete", { actor: admin.username, detail: maskEmail(subscriber.email) });
  revalidatePath("/admin/subscribers");
}
