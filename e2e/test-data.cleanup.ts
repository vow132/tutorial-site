import { expect, test } from "@playwright/test";
import { queryDatabase, writeDatabase } from "./helpers";

/**
 * 全部测试跑完后清掉测试留下的搜索词统计（限流测试的 burst- / recover-、没搜到结果的「没有这篇教程…」、
 * 正文摘要测试的「独门诀窍…」），免得本地跑完测试，仪表盘「读者在搜什么」里全是测试数据。
 * 搜索统计每 5 秒批量写一次库，这时早就写完了。
 */
const PATTERNS = ["burst-%", "recover-%", "没有这篇教程%", "独门诀窍%"];

test("search statistics left by the tests are removed", async () => {
  const where = PATTERNS.map(() => `"query" LIKE ?`).join(" OR ");
  writeDatabase(`DELETE FROM "SearchQueryDaily" WHERE ${where}`, ...PATTERNS);
  expect(queryDatabase<{ n: number }>(`SELECT COUNT(*) AS n FROM "SearchQueryDaily" WHERE ${where}`, ...PATTERNS)!.n).toBe(0);
});
