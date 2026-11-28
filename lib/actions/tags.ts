"use server";

import { revalidatePath, revalidateTag } from "next/cache";
import { redirect } from "next/navigation";
import { requireAuth } from "@/lib/admin-auth";
import { getAdminI18n } from "@/lib/i18n/server";
import { audit } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { CACHE_TAGS } from "@/lib/public-data";
import { MAX_TAG_LENGTH, normalizeTagName, tagPath, tagSlug } from "@/lib/tags";
import { tutorialSlugsWithTag } from "@/lib/tag-sync";
import { revalidateSitePath } from "@/lib/revalidate-public";

export type TagFormState = { error?: string; success?: string };

/** 标签变动影响：标签页、标签云、相关教程，以及带这个标签的文章页（ISR，需按路径失效）。 */
function revalidateTagPages(tutorialSlugs: string[], ...tagSlugs: string[]) {
  revalidateTag(CACHE_TAGS.tags, { expire: 0 });
  revalidateTag(CACHE_TAGS.tutorials, { expire: 0 });
  revalidateSitePath("/tags");
  for (const slug of tagSlugs) revalidateSitePath(tagPath(slug));
  for (const slug of new Set(tutorialSlugs)) {
    revalidateSitePath(`/tutorials/${slug}`);
    revalidateSitePath(`/tutorials/${encodeURIComponent(slug)}`);
  }
  revalidatePath("/admin/tags");
}

/**
 * 重命名标签。新名字和另一个已有标签相同（按别名比较）时合并：
 * 教程改挂到那个标签上，原标签删除。
 */
export async function renameTag(_prev: TagFormState, formData: FormData): Promise<TagFormState> {
  const admin = await requireAuth("taxonomy");
  const { m, f } = await getAdminI18n();
  const t = m.admin.tags;
  const id = Number(formData.get("id"));
  const name = normalizeTagName(String(formData.get("name") ?? ""));
  if (!name) return { error: t.nameRequired };
  if (Array.from(name).length > MAX_TAG_LENGTH) return { error: f(t.nameTooLong, { max: MAX_TAG_LENGTH }) };
  const slug = tagSlug(name);
  if (!slug) return { error: t.nameNoText };

  const tag = await prisma.tag.findUnique({ where: { id } });
  if (!tag) return { error: t.gone };
  if (tag.name === name) return { success: t.unchanged };

  const tutorialSlugs = await tutorialSlugsWithTag(id);
  const target = await prisma.tag.findUnique({ where: { slug } });

  if (target && target.id !== id) {
    const already = new Set(
      (await prisma.tutorialTag.findMany({ where: { tagId: target.id }, select: { tutorialId: true } })).map(
        (row) => row.tutorialId,
      ),
    );
    const moving = (await prisma.tutorialTag.findMany({ where: { tagId: id }, select: { tutorialId: true } }))
      .map((row) => row.tutorialId)
      .filter((tutorialId) => !already.has(tutorialId));
    await prisma.$transaction([
      prisma.tutorialTag.updateMany({ where: { tagId: id, tutorialId: { in: moving } }, data: { tagId: target.id } }),
      // 两边都有的教程：删掉原标签上的那条，保留目标标签
      prisma.tag.delete({ where: { id } }),
    ]);
    await audit("tag.merge", { actor: admin.username, detail: `${tag.name} → ${target.name}` });
    revalidateTagPages(tutorialSlugs, tag.slug, target.slug);
    // 原标签那一行已经不在了，行内提示看不到：跳回列表并在页面顶部提示。
    redirect(`/admin/tags?merged=${encodeURIComponent(target.name)}`);
  }

  await prisma.tag.update({ where: { id }, data: { name, slug } });
  await audit("tag.rename", { actor: admin.username, detail: `${tag.name} → ${name}` });
  revalidateTagPages(tutorialSlugs, tag.slug, slug);
  return { success: m.admin.common.saved };
}

/** 删除标签：只解除和教程的关联，教程本身不受影响。 */
export async function deleteTag(formData: FormData) {
  const admin = await requireAuth("taxonomy");
  const id = Number(formData.get("id"));
  const tag = id ? await prisma.tag.findUnique({ where: { id } }) : null;
  if (!tag) return;
  const tutorialSlugs = await tutorialSlugsWithTag(id);
  await prisma.tag.delete({ where: { id } });
  const { m, plural } = await getAdminI18n();
  await audit("tag.delete", { actor: admin.username, detail: plural(tutorialSlugs.length, m.admin.auditDetail.withTutorials, { title: tag.name }) });
  revalidateTagPages(tutorialSlugs, tag.slug);
}
