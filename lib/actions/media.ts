"use server";

import { revalidatePath } from "next/cache";
import { requireAuth } from "@/lib/admin-auth";
import { audit } from "@/lib/audit";
import { cleanableStems, collectReferences, formatBytes, moveUploadsToTrash, referenceLabel } from "@/lib/media";
import { getAdminI18n } from "@/lib/i18n/server";
import { isVariantName, uploadStem } from "@/lib/upload-refs.mjs";

export type MediaActionState = { error?: string; success?: string };

/** 删除一张没被引用的图片（连同小图）：移到上传目录里的 .trash/，有问题可以移回来。 */
export async function deleteMedia(_prev: MediaActionState, formData: FormData): Promise<MediaActionState> {
  const admin = await requireAuth("media");
  const i18n = await getAdminI18n();
  const { f, plural } = i18n;
  const t = i18n.m.admin.media;
  const name = String(formData.get("name") ?? "");
  if (!/^[\w.-]+$/.test(name) || name.startsWith(".") || isVariantName(name)) return { error: t.badName };
  // 删除前再查一次：页面打开以后可能有人刚把它插进了文章
  const references = (await collectReferences()).get(uploadStem(name)) ?? [];
  if (references.length) return { error: plural(references.length, t.stillUsed, { where: referenceLabel(references[0], i18n) }) };
  const moved = await moveUploadsToTrash([uploadStem(name)]);
  if (!moved.files) return { error: t.gone };
  await audit("media.delete", { actor: admin.username, detail: `${name} (${formatBytes(moved.bytes)})` });
  revalidatePath("/admin/media");
  return { success: f(t.deleted, { name }) };
}

/** 清理所有没被引用、而且不是最近几天上传的图片（和 npm run uploads:clean -- --apply 一样）。 */
export async function cleanUnusedMedia(): Promise<MediaActionState> {
  const admin = await requireAuth("media");
  const { m, plural } = await getAdminI18n();
  const t = m.admin.media;
  const stems = await cleanableStems();
  if (stems.length === 0) return { success: t.nothingToClean };
  const moved = await moveUploadsToTrash(stems);
  const size = formatBytes(moved.bytes);
  await audit("media.clean", { actor: admin.username, detail: plural(stems.length, t.auditCleaned, { size }) });
  revalidatePath("/admin/media");
  return { success: plural(stems.length, t.cleaned, { size }) };
}
