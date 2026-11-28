"use server";

import { revalidatePath, revalidateTag } from "next/cache";
import { requireAuth } from "@/lib/admin-auth";
import { getAdminI18n } from "@/lib/i18n/server";
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
  const { m, f } = await getAdminI18n();
  const t = m.admin.subscribers;
  if (config.enabled && !mailConfigComplete(config)) return { error: t.incomplete };
  const error = validateMailConfig(config);
  if (error) return { error: t.invalid[error] };
  await saveMailConfig(config);
  await audit("mail.settings", {
    actor: admin.username,
    detail: f(t.auditDetail, {
      state: config.enabled ? t.auditOn : t.auditOff,
      host: config.host || t.auditEmpty,
      port: config.port,
      from: config.fromEmail || t.auditEmpty,
    }),
  });
  // 前台订阅框是否显示跟着变（文章页、页脚）
  revalidateTag(CACHE_TAGS.settings, { expire: 0 });
  revalidatePath("/", "layout");
  return { success: config.enabled ? t.savedOn : t.savedOff };
}

/** 用当前保存的配置发一封测试邮件。 */
export async function sendTestMail(_prev: MailFormState, formData: FormData): Promise<MailFormState> {
  await requireAuth();
  const { m, f } = await getAdminI18n();
  const t = m.admin.subscribers;
  const to = normalizeEmail(formData.get("to"));
  if (!to) return { error: t.toRequired };
  const config = await getMailConfig();
  if (!mailConfigComplete(config)) return { error: t.saveFirst };
  const { siteName } = await getSettings();
  try {
    await sendOne(config, siteName, {
      to,
      subject: f(t.testSubject, { site: siteName }),
      text: t.testBody,
      html: `<p>${t.testBody}</p>`,
    });
  } catch (reason) {
    return { error: f(t.sendFailed, { reason: reason instanceof Error ? reason.message : String(reason) }) };
  }
  return { success: f(t.sent, { to }) };
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
