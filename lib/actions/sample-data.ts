"use server";

import { revalidatePath, revalidateTag } from "next/cache";
import { redirect } from "next/navigation";
import { requireAuth } from "@/lib/admin-auth";
import { audit } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { CACHE_TAGS } from "@/lib/public-data";
import { revalidatePublic } from "@/lib/revalidate-public";
import { SAMPLE_CATEGORY_SLUGS, SAMPLE_TAG_NAMES, SAMPLE_TUTORIAL_SLUGS } from "@/lib/sample-data";

/**
 * 清除种子数据里的示例内容：示例教程（连同它们的历史版本、统计、留言）、
 * 已经没有教程也没有子分类的示例分类、已经没有教程的示例标签。站长自己建的内容不动。
 */
export async function clearSampleData() {
  const admin = await requireAuth();
  const tutorials = await prisma.tutorial.findMany({ where: { slug: { in: SAMPLE_TUTORIAL_SLUGS } }, select: { id: true, slug: true } });
  await prisma.tutorial.deleteMany({ where: { id: { in: tutorials.map((t) => t.id) } } });
  const categories = await prisma.category.deleteMany({
    where: { slug: { in: SAMPLE_CATEGORY_SLUGS }, tutorials: { none: {} }, children: { none: {} } },
  });
  const tags = await prisma.tag.deleteMany({ where: { name: { in: SAMPLE_TAG_NAMES }, tutorials: { none: {} } } });
  await audit("sample.clear", {
    actor: admin.username,
    detail: `示例教程 ${tutorials.length} 篇、分类 ${categories.count} 个、标签 ${tags.count} 个`,
  });
  revalidatePublic(...tutorials.map((t) => t.slug));
  revalidateTag(CACHE_TAGS.categories, { expire: 0 });
  revalidatePath("/", "layout");
  redirect(`/admin?sampleCleared=${tutorials.length}`);
}
