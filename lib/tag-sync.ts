import { prisma } from "@/lib/prisma";
import { tagSlug } from "@/lib/tags";

/**
 * 把教程的标签设成 names（按填写顺序）；还不存在的标签自动创建。
 * 按别名匹配已有标签，所以「CSS」「css」会归到同一个标签，沿用最早的写法。
 */
export async function setTutorialTags(tutorialId: number, names: string[]) {
  const tagIds: number[] = [];
  for (const name of names) {
    const slug = tagSlug(name);
    const tag = await prisma.tag.upsert({ where: { slug }, update: {}, create: { name, slug }, select: { id: true } });
    tagIds.push(tag.id);
  }
  await prisma.$transaction([
    prisma.tutorialTag.deleteMany({ where: { tutorialId } }),
    prisma.tutorialTag.createMany({ data: tagIds.map((tagId, position) => ({ tutorialId, tagId, position })) }),
  ]);
}

/** 后台输入建议：全部标签按使用次数排序（最多 300 个）。 */
export async function tagSuggestions() {
  const tags = await prisma.tag.findMany({
    select: { name: true, _count: { select: { tutorials: true } } },
    orderBy: { tutorials: { _count: "desc" } },
    take: 300,
  });
  return tags.map((tag) => tag.name);
}

/** 某篇教程当前的标签名（按填写顺序）。 */
export async function tutorialTagNames(tutorialId: number) {
  const rows = await prisma.tutorialTag.findMany({
    where: { tutorialId },
    orderBy: { position: "asc" },
    select: { tag: { select: { name: true } } },
  });
  return rows.map((row) => row.tag.name);
}

/** 某个标签下全部教程的 slug（改名、合并、删除标签后要刷新这些文章页的缓存）。 */
export async function tutorialSlugsWithTag(tagId: number) {
  const rows = await prisma.tutorial.findMany({ where: { tags: { some: { tagId } } }, select: { slug: true } });
  return rows.map((row) => row.slug);
}
