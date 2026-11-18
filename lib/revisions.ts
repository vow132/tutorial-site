import { prisma } from "@/lib/prisma";

/** 每篇教程最多保留的历史版本数。 */
export const MAX_REVISIONS = 30;

type Snapshot = { title: string; excerpt: string | null; content: string; updatedAt: Date };

export function contentChanged(before: Snapshot, after: { title: string; excerpt: string | null; content: string }) {
  return before.title !== after.title || before.excerpt !== after.excerpt || before.content !== after.content;
}

/** 把即将被替换的旧内容存成一个历史版本，并删掉超出上限的最旧版本。 */
export async function saveRevision(tutorialId: number, before: Snapshot, replacedBy: string) {
  await prisma.tutorialRevision.create({
    data: {
      tutorialId,
      title: before.title,
      excerpt: before.excerpt,
      content: before.content,
      savedAt: before.updatedAt,
      replacedBy,
    },
  });
  const extra = await prisma.tutorialRevision.findMany({
    where: { tutorialId },
    orderBy: [{ savedAt: "desc" }, { id: "desc" }],
    skip: MAX_REVISIONS,
    select: { id: true },
  });
  if (extra.length > 0) {
    await prisma.tutorialRevision.deleteMany({ where: { id: { in: extra.map((row) => row.id) } } });
  }
}
