"use server";

import { revalidatePath, revalidateTag } from "next/cache";
import { requireAuth } from "@/lib/admin-auth";
import { audit } from "@/lib/audit";
import { CACHE_TAGS } from "@/lib/public-data";
import { isTurnstileKey, maskKey } from "@/lib/turnstile";
import { checkTurnstileToken, loadTurnstile, saveTurnstile } from "@/lib/turnstile-store";

export type TurnstileFormState = { error?: string; success?: string };

/**
 * 保存人机验证设置（只有站长）。Secret Key 框留空表示不修改（页面不回显）。
 * 开启时必须先在设置页用这组密钥通过一次验证，服务器也要能连上 Cloudflare 核对成功才保存：
 * 填错 Site Key / Secret Key、或服务器连不上 Cloudflare 时开启，会让所有人（包括站长）都登录不了。
 */
export async function saveTurnstileSettings(_prev: TurnstileFormState, formData: FormData): Promise<TurnstileFormState> {
  const admin = await requireAuth();
  const current = await loadTurnstile();
  const enabled = formData.get("enabled") === "on";
  const siteKey = String(formData.get("siteKey") ?? "").trim();
  const newSecret = String(formData.get("secret") ?? "").trim();
  const secret = newSecret || current.secret;

  if (siteKey && !isTurnstileKey(siteKey)) return { error: "Site Key 格式不对：在 Cloudflare 后台 Turnstile 页面复制，形如 0x4AAAAAAA…" };
  if (newSecret && !isTurnstileKey(newSecret)) return { error: "Secret Key 格式不对：在 Cloudflare 后台 Turnstile 页面复制，形如 0x4AAAAAAA…" };

  if (enabled) {
    if (!siteKey || !secret) return { error: "开启前请填好 Site Key 和 Secret Key" };
    const verdict = await checkTurnstileToken(secret, formData.get("turnstileToken"), "settings");
    if (!verdict.ok) {
      return {
        error:
          verdict.reason === "missing token"
            ? "请先完成下面的人机验证（证明这组密钥能用），再保存"
            : `验证没通过，没有保存：${verdict.reason}。请检查 Site Key 和 Secret Key 是否是同一个小组件的、小组件的域名里有没有本站，以及服务器能否访问 challenges.cloudflare.com`,
      };
    }
  }

  await saveTurnstile({ enabled, siteKey, secret });
  await audit("turnstile.settings", {
    actor: admin.username,
    detail: `${enabled ? "开启" : "关闭"}人机验证；Site Key ${siteKey ? maskKey(siteKey) : "未填写"}${newSecret ? "；更换了 Secret Key" : ""}`,
  });
  // 前台的订阅框、留言框要不要显示小组件跟着变
  revalidateTag(CACHE_TAGS.settings, { expire: 0 });
  revalidatePath("/", "layout");
  return { success: enabled ? "已开启：后台登录、邮件订阅和读者留言都要先过人机验证" : "已保存（人机验证未开启）" };
}
