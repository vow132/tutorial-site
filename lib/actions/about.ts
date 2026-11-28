"use server";

import { revalidateTag } from "next/cache";
import { requireAuth } from "@/lib/admin-auth";
import { ABOUT_KEY } from "@/lib/about";
import { getAdminI18n, getSiteI18n } from "@/lib/i18n/server";
import { audit } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { CACHE_TAGS } from "@/lib/public-data";
import { sanitizeArticleHtml } from "@/lib/sanitize";
import { revalidateSitePath } from "@/lib/revalidate-public";

export type AboutFormState = { error?: string; success?: string };

export async function updateAbout(_prev: AboutFormState, formData: FormData): Promise<AboutFormState> {
  const admin = await requireAuth("about");
  const t = (await getAdminI18n()).m.admin.about;
  const title = String(formData.get("title") ?? "").trim() || (await getSiteI18n()).m.defaults.aboutTitle;
  if (title.length > 60) return { error: t.titleTooLong };
  // Server Action 可以绕过编辑器直接调用，入库前按正文白名单过滤。
  const content = sanitizeArticleHtml(String(formData.get("content") ?? "")).trim();
  if (content.length > 200_000) return { error: t.contentTooLong };

  const value = JSON.stringify({ title, content, updatedAt: new Date().toISOString() });
  await prisma.setting.upsert({
    where: { key: ABOUT_KEY },
    update: { value },
    create: { key: ABOUT_KEY, value },
  });
  await audit("about.update", { actor: admin.username });
  revalidateTag(CACHE_TAGS.about, { expire: 0 });
  revalidateSitePath("/about");
  return { success: content && content !== "<p></p>" ? t.saved : t.cleared };
}
