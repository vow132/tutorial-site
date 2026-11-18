import { prisma } from "@/lib/prisma";
import { stripHtml } from "@/lib/article";

/**
 * 中文短词索引。主搜索用 FTS5 trigram，至少要 3 个字才能走索引，而中文常用词大多是两个字
 * （「缓存」「指纹」）。这里另建一张 FTS5 表（TutorialBigram），把汉字按两两相邻切开存成词，
 * 两个字的查询就能命中正文。SQLite 触发器做不了切词，所以由应用维护：
 * 启动时补齐，教程保存/删除后再同步一次（按 updatedAt 判断哪些需要重建）。
 */

/** 汉字、日文假名、韩文：这些文字没有空格分词。 */
const CJK = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u;

/** 把文本变成检索词：连续的 CJK 字符两两相邻成词（单字保留），其余文字原样交给 unicode61 分词。 */
export function searchTerms(text: string) {
  const out: string[] = [];
  let run: string[] = [];
  let other = "";
  const flushRun = () => {
    if (run.length === 1) out.push(run[0]);
    for (let i = 0; i + 1 < run.length; i++) out.push(run[i] + run[i + 1]);
    run = [];
  };
  for (const char of text.normalize("NFKC").toLowerCase()) {
    if (CJK.test(char)) {
      if (other) {
        out.push(other);
        other = "";
      }
      run.push(char);
    } else {
      flushRun();
      other += char;
    }
  }
  flushRun();
  if (other) out.push(other);
  return out.join(" ").replace(/\s+/g, " ").trim();
}

/**
 * 1–2 个字的查询怎么查这张表：两个汉字查整词；一个汉字查以它开头的词（前缀查询）；
 * 两个字母/数字（如 go、js）按单词查。其他情况（单个字母等）返回 null，只搜标题。
 */
export function bigramMatchQuery(query: string): string | null {
  const chars = Array.from(query.normalize("NFKC").toLowerCase().replace(/[\p{P}\p{S}\s]/gu, ""));
  if (chars.length === 0) return null;
  if (chars.every((char) => CJK.test(char))) {
    if (chars.length === 2) return `"${chars.join("")}"`;
    if (chars.length === 1) return `"${chars[0]}"*`;
    return null;
  }
  if (chars.length === 2 && chars.every((char) => /[\p{L}\p{N}]/u.test(char))) return `"${chars.join("")}"`;
  return null;
}

const BATCH = 50;
let syncing: Promise<number> | null = null;

/** 补齐/更新索引；并发调用会合并成一次。返回重建的教程数。 */
export function syncSearchIndex(): Promise<number> {
  syncing ??= runSync().finally(() => {
    syncing = null;
  });
  return syncing;
}

async function runSync() {
  let count = 0;
  try {
    await prisma.$executeRaw`DELETE FROM "TutorialBigram" WHERE "rowid" NOT IN (SELECT "id" FROM "Tutorial")`;
    for (;;) {
      // 只取需要重建的：索引里没有，或教程在索引之后又改过
      const stale = await prisma.$queryRaw<Array<{ id: number | bigint }>>`
        SELECT t."id" FROM "Tutorial" AS t
        LEFT JOIN "TutorialBigram" AS b ON b."rowid" = t."id"
        WHERE b."rowid" IS NULL OR b."updatedAt" IS NOT CAST(t."updatedAt" AS TEXT)
        LIMIT ${BATCH}
      `;
      if (stale.length === 0) break;
      const rows = await prisma.tutorial.findMany({
        where: { id: { in: stale.map((row) => Number(row.id)) } },
        select: { id: true, title: true, excerpt: true, content: true },
      });
      for (const row of rows) {
        const terms = searchTerms(`${row.title} ${row.excerpt ?? ""} ${stripHtml(row.content, Number.MAX_SAFE_INTEGER)}`);
        await prisma.$transaction([
          prisma.$executeRaw`DELETE FROM "TutorialBigram" WHERE "rowid" = ${row.id}`,
          prisma.$executeRaw`
            INSERT INTO "TutorialBigram" ("rowid", "terms", "updatedAt")
            SELECT ${row.id}, ${terms}, CAST("updatedAt" AS TEXT) FROM "Tutorial" WHERE "id" = ${row.id}
          `,
        ]);
        count++;
      }
      // 让出事件循环：大站第一次建索引时不阻塞正在处理的请求
      await new Promise((resolve) => setImmediate(resolve));
    }
  } catch (error) {
    // 迁移还没执行（滚动部署期间）时表不存在：短词搜索退回只搜标题
    console.warn("[search-index] 同步失败：", error instanceof Error ? error.message : error);
  }
  return count;
}
