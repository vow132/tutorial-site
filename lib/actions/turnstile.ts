"use server";

import { revalidatePath, revalidateTag } from "next/cache";
import { requireAuth } from "@/lib/admin-auth";
import { audit } from "@/lib/audit";
import { CACHE_TAGS } from "@/lib/public-data";
import { isTurnstileKey, maskKey } from "@/lib/turnstile";
import { checkTurnstileToken, loadTurnstile, saveTurnstile } from "@/lib/turnstile-store";
import { getAdminI18n } from "@/lib/i18n/server";

export type TurnstileFormState = { error?: string; success?: string };

/**
 * 保存人机验证设置（只有站长）。Secret Key 框留空表示不修改（页面不回显）。
 * 开启时必须先在设置页用这组密钥通过一次验证，服务器也要能连上 Cloudflare 核对成功才保存：
 * 填错 Site Key / Secret Key、或服务器连不上 Cloudflare 时开启，会让所有人（包括站长）都登录不了。
 */
export async function saveTurnstileSettings(_prev: TurnstileFormState, formData: FormData): Promise<TurnstileFormState> {
  const admin = await requireAuth();
  const { m, f } = await getAdminI18n();
  const t = m.admin.turnstileErrors;
  const current = await loadTurnstile();
  const enabled = formData.get("enabled") === "on";
  const siteKey = String(formData.get("siteKey") ?? "").trim();
  const newSecret = String(formData.get("secret") ?? "").trim();
  const secret = newSecret || current.secret;

  if (siteKey && !isTurnstileKey(siteKey)) return { error: t.siteKey };
  if (newSecret && !isTurnstileKey(newSecret)) return { error: t.secret };

  if (enabled) {
    if (!siteKey || !secret) return { error: t.keysRequired };
    const verdict = await checkTurnstileToken(secret, formData.get("turnstileToken"), "settings");
    if (!verdict.ok) {
      return {
        error:
          verdict.reason === "missing token" ? t.tryFirst : f(t.failed, { reason: verdict.reason }),
      };
    }
  }

  await saveTurnstile({ enabled, siteKey, secret });
  await audit("turnstile.settings", {
    actor: admin.username,
    detail: [enabled ? t.auditOn : t.auditOff, f(t.auditKey, { key: siteKey ? maskKey(siteKey) : t.auditEmpty }), newSecret ? t.auditSecret : ""]
      .filter(Boolean)
      .join("; "),
  });
  // 前台的订阅框、留言框要不要显示小组件跟着变
  revalidateTag(CACHE_TAGS.settings, { expire: 0 });
  revalidatePath("/", "layout");
  return { success: enabled ? t.savedOn : t.savedOff };
}
