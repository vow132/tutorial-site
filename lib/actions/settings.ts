"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/admin-auth";
import { SETTINGS_KEY, type SiteSettings } from "@/lib/settings";

export type SettingsFormState = { error?: string; success?: string };


export async function updateSettings(
  _prev: SettingsFormState,
  formData: FormData
): Promise<SettingsFormState> {
  await requireAuth();

  const text = (key: string) => String(formData.get(key) ?? "").trim();

  let footerColumns: SiteSettings["footerColumns"];
  try {
    const raw = text("footerColumns");
    footerColumns = JSON.parse(raw);
    if (!Array.isArray(footerColumns)) throw new Error();
    for (const col of footerColumns) {
      if (typeof col.title !== "string" || !Array.isArray(col.links)) {
        throw new Error();
      }
    }
  } catch {
    return { error: "底部栏目数据格式有误" };
  }

  const settings: SiteSettings = {
    siteName: text("siteName") || "教程网",
    logoText: text("logoText") || "教",
    siteTitle: text("siteTitle") || "教程网",
    siteDescription: text("siteDescription"),
    heroBadge: text("heroBadge"),
    heroTitleA: text("heroTitleA"),
    heroTitleB: text("heroTitleB"),
    heroAccent: text("heroAccent"),
    heroSubtitle: text("heroSubtitle"),
    footerTagline: text("footerTagline"),
    copyright: text("copyright"),
    footerColumns,
  };

  if (!settings.siteTitle) return { error: "网站标题不能为空" };

  await prisma.setting.upsert({
    where: { key: SETTINGS_KEY },
    update: { value: JSON.stringify(settings) },
    create: { key: SETTINGS_KEY, value: JSON.stringify(settings) },
  });

  revalidatePath("/", "layout");
  return { success: "设置已保存，前台已生效" };
}
