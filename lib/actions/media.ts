"use server";

import { revalidatePath } from "next/cache";
import { requireAuth } from "@/lib/admin-auth";
import { audit } from "@/lib/audit";
import { cleanableStems, collectReferences, formatBytes, moveUploadsToTrash } from "@/lib/media";
import { isVariantName, uploadStem } from "@/lib/upload-refs.mjs";

export type MediaActionState = { error?: string; success?: string };

/** 删除一张没被引用的图片（连同小图）：移到上传目录里的 .trash/，有问题可以移回来。 */
export async function deleteMedia(_prev: MediaActionState, formData: FormData): Promise<MediaActionState> {
  const admin = await requireAuth("media");
  const name = String(formData.get("name") ?? "");
  if (!/^[\w.-]+$/.test(name) || name.startsWith(".") || isVariantName(name)) return { error: "文件名不对" };
  // 删除前再查一次：页面打开以后可能有人刚把它插进了文章
  const references = (await collectReferences()).get(uploadStem(name)) ?? [];
  if (references.length) return { error: `还有 ${references.length} 处在用这张图片（${references[0].label}），先从那里删掉再来` };
  const moved = await moveUploadsToTrash([uploadStem(name)]);
  if (!moved.files) return { error: "这张图片已经不在了" };
  await audit("media.delete", { actor: admin.username, detail: `${name}（${formatBytes(moved.bytes)}）` });
  revalidatePath("/admin/media");
  return { success: `已删除 ${name}，文件移到了上传目录的 .trash 里` };
}

/** 清理所有没被引用、而且不是最近几天上传的图片（和 npm run uploads:clean -- --apply 一样）。 */
export async function cleanUnusedMedia(): Promise<MediaActionState> {
  const admin = await requireAuth("media");
  const stems = await cleanableStems();
  if (stems.length === 0) return { success: "没有需要清理的图片" };
  const moved = await moveUploadsToTrash(stems);
  await audit("media.clean", { actor: admin.username, detail: `${stems.length} 张，${formatBytes(moved.bytes)}` });
  revalidatePath("/admin/media");
  return { success: `已清理 ${stems.length} 张没用的图片（${formatBytes(moved.bytes)}），文件移到了上传目录的 .trash 里` };
}
