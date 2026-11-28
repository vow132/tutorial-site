import { prisma } from "@/lib/prisma";
import { SAMPLE_CATEGORY_SLUGS, SAMPLE_TAG_NAMES, SAMPLE_TUTORIAL_SLUGS } from "@/lib/sample-data";
import type { I18n } from "@/lib/i18n/core";

/**
 * 删除种子数据里的示例内容：示例教程（连同它们的历史版本、统计、留言）、
 * 已经没有教程也没有子分类的示例分类、已经没有教程的示例标签。站长自己建的内容不动。
 * 后台「一键清除示例数据」和安装页共用；调用方负责刷新缓存和写安全日志。
 */
export async function removeSampleData({ m, f }: I18n) {
  const tutorials = await prisma.tutorial.findMany({ where: { slug: { in: SAMPLE_TUTORIAL_SLUGS } }, select: { id: true, slug: true } });
  await prisma.tutorial.deleteMany({ where: { id: { in: tutorials.map((t) => t.id) } } });
  const categories = await prisma.category.deleteMany({
    where: { slug: { in: SAMPLE_CATEGORY_SLUGS }, tutorials: { none: {} }, children: { none: {} } },
  });
  const tags = await prisma.tag.deleteMany({ where: { name: { in: SAMPLE_TAG_NAMES }, tutorials: { none: {} } } });
  return {
    slugs: tutorials.map((t) => t.slug),
    summary: f(m.admin.auditDetail.sampleSummary, { tutorials: tutorials.length, categories: categories.count, tags: tags.count }),
  };
}
