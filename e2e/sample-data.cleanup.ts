import { execFileSync } from "node:child_process";
import { expect, test } from "@playwright/test";
import { ADMIN_STATE, createTutorialViaForm, deleteTutorialRow, queryDatabase, uniqueSuffix } from "./helpers";

/**
 * 「一键清除示例数据」会删掉其他测试依赖的种子教程，所以单独放在 cleanup 项目里，等全部测试跑完才执行，
 * 结束时重新写入种子数据。清除到重新写入之间不访问前台页面，免得把「没有示例教程」的页面存进缓存。
 */
test.use({ storageState: ADMIN_STATE });

const count = (sql: string, ...params: unknown[]) => queryDatabase<{ n: number }>(sql, ...params)!.n;

test("clearing sample data removes the seeded tutorials and unused sample categories and tags only", async ({ page }) => {
  const id = uniqueSuffix();
  const title = `E2E 自己的教程 ${id}`;
  // 用第一个分类（种子里的「前端开发」）写一篇自己的教程：这个示例分类之后要保留
  await createTutorialViaForm(page, { title, slug: `e2e-own-${id}` });
  const own = queryDatabase<{ slug: string }>(
    `SELECT c.slug FROM "Tutorial" t JOIN "Category" c ON c.id = t.categoryId WHERE t.title = ?`,
    title,
  )!;

  try {
    expect(count(`SELECT COUNT(*) AS n FROM "Tutorial" WHERE slug IN ('css-flexbox-guide','nodejs-file-io','http-cache-in-5-min')`)).toBe(3);
    await page.goto("/admin");
    page.once("dialog", (dialog) => dialog.accept());
    await page.getByRole("button", { name: "一键清除示例数据" }).click();
    await expect(page).toHaveURL(/\/admin\?sampleCleared=3$/);
    await expect(page.locator("details.launch-checklist").getByText("已完成：清除示例教程")).toBeAttached();
    await expect(page.getByRole("button", { name: "一键清除示例数据" })).toHaveCount(0);

    expect(count(`SELECT COUNT(*) AS n FROM "Tutorial" WHERE slug IN ('css-flexbox-guide','nodejs-file-io','http-cache-in-5-min')`)).toBe(0);
    expect(count(`SELECT COUNT(*) AS n FROM "Tutorial" WHERE title = ?`, title)).toBe(1);
    // 还有教程在用的示例分类保留，没人用的删掉
    expect(count(`SELECT COUNT(*) AS n FROM "Category" WHERE slug = ?`, own.slug)).toBe(1);
    expect(count(`SELECT COUNT(*) AS n FROM "Category" WHERE slug = 'design'`)).toBe(0);
    // 只属于示例教程的标签删掉
    expect(count(`SELECT COUNT(*) AS n FROM "Tag" WHERE name = 'Flexbox'`)).toBe(0);
    expect(count(`SELECT COUNT(*) AS n FROM "AuditLog" WHERE action = 'sample.clear'`)).toBeGreaterThan(0);
  } finally {
    // 恢复种子数据，再通过后台删一篇教程，让前台缓存按恢复后的数据刷新
    execFileSync("npx", ["prisma", "db", "seed"], { stdio: "pipe", env: process.env });
    await deleteTutorialRow(page, title);
  }
  expect(count(`SELECT COUNT(*) AS n FROM "Tutorial" WHERE slug IN ('css-flexbox-guide','nodejs-file-io','http-cache-in-5-min')`)).toBe(3);
  await page.goto("/tutorials/css-flexbox-guide");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Flexbox");
});
