"use server";

import { revalidatePath, revalidateTag } from "next/cache";
import { redirect } from "next/navigation";
import { requireAuth } from "@/lib/admin-auth";
import { audit } from "@/lib/audit";
import { CACHE_TAGS } from "@/lib/public-data";
import { revalidatePublic } from "@/lib/revalidate-public";
import { removeSampleData } from "@/lib/sample-data-remove";

/** 仪表盘上线检查清单里的「一键清除示例数据」（只有站长能用）。 */
export async function clearSampleData() {
  const admin = await requireAuth();
  const removed = await removeSampleData();
  await audit("sample.clear", { actor: admin.username, detail: removed.summary });
  revalidatePublic(...removed.slugs);
  revalidateTag(CACHE_TAGS.categories, { expire: 0 });
  revalidatePath("/", "layout");
  redirect(`/admin?sampleCleared=${removed.slugs.length}`);
}
