import { unstable_cache } from "next/cache";
import { prisma } from "@/lib/prisma";
import { CACHE_TAGS, SLOW_REVALIDATE_SECONDS } from "@/lib/public-data";

/**
 * 「关于本站」页面内容：单独存在 Setting 表 key="about"（正文可能很长，不和每个页面都要读的站点设置放一起）。
 * content 是已过滤的正文 HTML；为空时前台 /about 返回 404、不进 sitemap。
 */
export const ABOUT_KEY = "about";

export type AboutPage = { title: string; content: string; updatedAt: string | null };

export const DEFAULT_ABOUT_TITLE = "关于本站";

export function parseAbout(raw: string | null | undefined): AboutPage {
  try {
    const value = raw ? (JSON.parse(raw) as Partial<AboutPage>) : {};
    return {
      title: typeof value.title === "string" && value.title.trim() ? value.title.trim() : DEFAULT_ABOUT_TITLE,
      content: typeof value.content === "string" ? value.content : "",
      updatedAt: typeof value.updatedAt === "string" ? value.updatedAt : null,
    };
  } catch {
    return { title: DEFAULT_ABOUT_TITLE, content: "", updatedAt: null };
  }
}

/** 正文是否真的有内容（编辑器清空后会留下 <p></p>）。 */
export function hasAboutContent(about: AboutPage) {
  return about.content.replace(/<p>\s*<\/p>/g, "").trim().length > 0;
}

const cachedAbout = unstable_cache(
  async () => (await prisma.setting.findUnique({ where: { key: ABOUT_KEY } }))?.value ?? null,
  ["about-page"],
  { tags: [CACHE_TAGS.about], revalidate: SLOW_REVALIDATE_SECONDS },
);

export async function getAbout() {
  return parseAbout(await cachedAbout());
}

/** 后台编辑用：不走缓存，直接读库。 */
export async function readAboutForAdmin() {
  return parseAbout((await prisma.setting.findUnique({ where: { key: ABOUT_KEY } }))?.value);
}
