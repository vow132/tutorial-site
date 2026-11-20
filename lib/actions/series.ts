"use server";

import { revalidatePath, revalidateTag } from "next/cache";
import { redirect } from "next/navigation";
import { requireAuth } from "@/lib/admin-auth";
import { audit } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { CACHE_TAGS } from "@/lib/public-data";
import { parseSeriesInput, seriesPath } from "@/lib/series";

export type SeriesFormState = { error?: string; success?: string };

/**
 * 系列变动影响：系列页、系列列表，以及系列里每篇教程的文章页（文章页是 ISR，
 * 系列目录在页面里，按路径显式失效最稳妥）。
 */
function revalidateSeries(seriesSlugs: (string | null | undefined)[], tutorialSlugs: string[]) {
  revalidateTag(CACHE_TAGS.series, { expire: 0 });
  revalidatePath("/series");
  // 所有系列页一起失效（包括之前缓存下来的 404，例如改名后的新别名）
  revalidatePath("/series/[slug]", "page");
  for (const slug of new Set(seriesSlugs.filter((item): item is string => Boolean(item)))) {
    revalidatePath(`/series/${slug}`);
    revalidatePath(seriesPath(slug));
  }
  for (const slug of new Set(tutorialSlugs)) {
    revalidatePath(`/tutorials/${slug}`);
    revalidatePath(`/tutorials/${encodeURIComponent(slug)}`);
  }
  revalidatePath("/admin/series");
}

async function memberSlugs(seriesId: number) {
  const rows = await prisma.tutorial.findMany({ where: { seriesId }, select: { slug: true } });
  return rows.map((row) => row.slug);
}

async function orderedIds(seriesId: number) {
  const rows = await prisma.tutorial.findMany({
    where: { seriesId },
    orderBy: [{ seriesOrder: "asc" }, { createdAt: "asc" }],
    select: { id: true },
  });
  return rows.map((row) => row.id);
}

export async function createSeries(_prev: SeriesFormState, formData: FormData): Promise<SeriesFormState> {
  const admin = await requireAuth();
  const parsed = parseSeriesInput({
    title: formData.get("title"),
    slug: formData.get("slug"),
    description: formData.get("description"),
  });
  if ("error" in parsed) return { error: parsed.error };
  if (await prisma.series.findUnique({ where: { slug: parsed.data.slug } })) return { error: "网址别名已被其他系列占用" };
  const created = await prisma.series.create({ data: parsed.data });
  await audit("series.create", { actor: admin.username, detail: `#${created.id} ${created.title}` });
  revalidatePath("/admin/series");
  redirect(`/admin/series/${created.id}`);
}

export async function updateSeries(id: number, _prev: SeriesFormState, formData: FormData): Promise<SeriesFormState> {
  const admin = await requireAuth();
  const parsed = parseSeriesInput({
    title: formData.get("title"),
    slug: formData.get("slug"),
    description: formData.get("description"),
  });
  if ("error" in parsed) return { error: parsed.error };
  const before = await prisma.series.findUnique({ where: { id } });
  if (!before) return { error: "系列不存在或已被删除" };
  const conflict = await prisma.series.findFirst({ where: { slug: parsed.data.slug, NOT: { id } } });
  if (conflict) return { error: "网址别名已被其他系列占用" };
  await prisma.series.update({ where: { id }, data: parsed.data });
  await audit("series.update", { actor: admin.username, detail: `#${id} ${parsed.data.title}` });
  revalidateSeries([before.slug, parsed.data.slug], await memberSlugs(id));
  revalidatePath(`/admin/series/${id}`);
  return { success: "已保存" };
}

/** 删除系列：教程本身保留，只是不再属于任何系列。 */
export async function deleteSeries(formData: FormData) {
  const admin = await requireAuth();
  const id = Number(formData.get("id"));
  const series = id ? await prisma.series.findUnique({ where: { id } }) : null;
  if (!series) return;
  const slugs = await memberSlugs(id);
  await prisma.$transaction([
    prisma.tutorial.updateMany({ where: { seriesId: id }, data: { seriesId: null, seriesOrder: 0 } }),
    prisma.series.delete({ where: { id } }),
  ]);
  await audit("series.delete", { actor: admin.username, detail: `${series.title}（${slugs.length} 篇教程）` });
  revalidateSeries([series.slug], slugs);
  redirect("/admin/series");
}

/** 把教程加入系列（排在末尾）；原来在别的系列里的会移过来。 */
export async function addToSeries(formData: FormData) {
  const admin = await requireAuth();
  const seriesId = Number(formData.get("seriesId"));
  const tutorialId = Number(formData.get("tutorialId"));
  const [series, tutorial] = await Promise.all([
    seriesId ? prisma.series.findUnique({ where: { id: seriesId } }) : null,
    tutorialId
      ? prisma.tutorial.findUnique({ where: { id: tutorialId }, select: { id: true, slug: true, title: true, seriesId: true, series: { select: { slug: true } } } })
      : null,
  ]);
  if (!series || !tutorial || tutorial.seriesId === seriesId) return;
  const ids = await orderedIds(seriesId);
  // 用原生 SQL 改归属：教程内容没变，不刷新 updatedAt（sitemap lastmod 不受影响）
  await prisma.$executeRaw`UPDATE "Tutorial" SET "seriesId" = ${seriesId}, "seriesOrder" = ${ids.length + 1} WHERE "id" = ${tutorialId}`;
  // 从别的系列移过来时，原系列剩下的重新编号
  if (tutorial.seriesId) await renumberRaw(await orderedIds(tutorial.seriesId));
  await audit("series.add", { actor: admin.username, detail: `${tutorial.title} → ${series.title}` });
  revalidateSeries([series.slug, tutorial.series?.slug], [...(await memberSlugs(seriesId)), ...(tutorial.series ? await memberSlugs(tutorial.seriesId!) : [])]);
  revalidateTag(CACHE_TAGS.tutorials, { expire: 0 });
  revalidatePath(`/admin/series/${seriesId}`);
}

/** 从系列里移出一篇（教程本身不受影响），其余重新编号。 */
export async function removeFromSeries(formData: FormData) {
  const admin = await requireAuth();
  const tutorialId = Number(formData.get("tutorialId"));
  const tutorial = tutorialId
    ? await prisma.tutorial.findUnique({ where: { id: tutorialId }, select: { slug: true, title: true, seriesId: true, series: true } })
    : null;
  if (!tutorial?.seriesId || !tutorial.series) return;
  const slugs = await memberSlugs(tutorial.seriesId);
  await prisma.$executeRaw`UPDATE "Tutorial" SET "seriesId" = NULL, "seriesOrder" = 0 WHERE "id" = ${tutorialId}`;
  await renumberRaw(await orderedIds(tutorial.seriesId));
  await audit("series.remove", { actor: admin.username, detail: `${tutorial.title} ← ${tutorial.series.title}` });
  revalidateSeries([tutorial.series.slug], slugs);
  revalidateTag(CACHE_TAGS.tutorials, { expire: 0 });
  revalidatePath(`/admin/series/${tutorial.seriesId}`);
}

/** 在系列里上移/下移一位。 */
export async function moveInSeries(formData: FormData) {
  await requireAuth();
  const tutorialId = Number(formData.get("tutorialId"));
  const direction = formData.get("direction") === "up" ? -1 : 1;
  const tutorial = tutorialId
    ? await prisma.tutorial.findUnique({ where: { id: tutorialId }, select: { seriesId: true, series: { select: { slug: true } } } })
    : null;
  if (!tutorial?.seriesId) return;
  const ids = await orderedIds(tutorial.seriesId);
  const from = ids.indexOf(tutorialId);
  const to = from + direction;
  if (from === -1 || to < 0 || to >= ids.length) return;
  [ids[from], ids[to]] = [ids[to], ids[from]];
  await renumberRaw(ids);
  revalidateSeries([tutorial.series?.slug], await memberSlugs(tutorial.seriesId));
  revalidateTag(CACHE_TAGS.tutorials, { expire: 0 });
  revalidatePath(`/admin/series/${tutorial.seriesId}`);
}

/** 按给定顺序重新编号为 1..n。用原生 SQL：调整顺序不算修改教程内容，不刷新 updatedAt。 */
async function renumberRaw(ids: number[]) {
  await prisma.$transaction(
    ids.map((id, index) => prisma.$executeRaw`UPDATE "Tutorial" SET "seriesOrder" = ${index + 1} WHERE "id" = ${id}`),
  );
}
