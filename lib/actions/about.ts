"use server";

import { revalidatePath, revalidateTag } from "next/cache";
import { requireAuth } from "@/lib/admin-auth";
import { ABOUT_KEY, DEFAULT_ABOUT_TITLE } from "@/lib/about";
import { audit } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { CACHE_TAGS } from "@/lib/public-data";
import { sanitizeArticleHtml } from "@/lib/sanitize";

export type AboutFormState = { error?: string; success?: string };

export async function updateAbout(_prev: AboutFormState, formData: FormData): Promise<AboutFormState> {
  const admin = await requireAuth("about");
  const title = String(formData.get("title") ?? "").trim() || DEFAULT_ABOUT_TITLE;
  if (title.length > 60) return { error: "标题不能超过 60 个字符" };
  // Server Action 可以绕过编辑器直接调用，入库前按正文白名单过滤。
  const content = sanitizeArticleHtml(String(formData.get("content") ?? "")).trim();
  if (content.length > 200_000) return { error: "正文太长了" };

  const value = JSON.stringify({ title, content, updatedAt: new Date().toISOString() });
  await prisma.setting.upsert({
    where: { key: ABOUT_KEY },
    update: { value },
    create: { key: ABOUT_KEY, value },
  });
  await audit("about.update", { actor: admin.username });
  revalidateTag(CACHE_TAGS.about, { expire: 0 });
  revalidatePath("/about");
  return { success: content && content !== "<p></p>" ? "已保存，前台 /about 已更新" : "已清空，前台不再显示关于页面" };
}
