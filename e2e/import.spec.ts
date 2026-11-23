import { mkdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { expect, test } from "@playwright/test";
import sharp from "sharp";
import { ADMIN_STATE, collectErrors, deleteTutorialRow, queryDatabase, uniqueSuffix } from "./helpers";

test.use({ storageState: ADMIN_STATE });

type Row = { slug: string; published: number; createdAt: string; updatedAt: string; notifiedAt: string | null; content: string; categoryId: number };
const tutorial = (slug: string) =>
  queryDatabase<Row>(`SELECT slug, published, createdAt, updatedAt, notifiedAt, content, categoryId FROM "Tutorial" WHERE slug = ?`, slug);

test("a Markdown folder imports with local images, original dates, tags and draft state", async ({ page }) => {
  const errors = collectErrors(page);
  const id = uniqueSuffix();
  const root = path.join(os.tmpdir(), `e2e-import-${id}`);
  const posts = path.join(root, "blog", "source", "_posts");
  const hexoTitle = `E2E Hexo 文章 ${id}`;
  const jekyllTitle = `E2E Jekyll 草稿 ${id}`;
  await mkdir(path.join(posts, "images"), { recursive: true });
  await sharp({ create: { width: 640, height: 360, channels: 3, background: "#22c55e" } }).png().toFile(path.join(posts, "images", "pic.png"));
  await writeFile(
    path.join(posts, `e2e-hexo-${id}.md`),
    [
      "---",
      `title: ${hexoTitle}`,
      "date: 2021-03-01 09:00:00",
      "tags: [E2E导入, CSS]",
      "categories: [前端开发]",
      `permalink: /2021/03/e2e-hexo-${id}/`,
      "---",
      "开头一段。",
      "",
      "<!-- more -->",
      "",
      "## 第一节",
      "![本地图](./images/pic.png)",
      "",
      "![外链图](http://127.0.0.1/blocked.png)",
    ].join("\n"),
  );
  await writeFile(path.join(posts, `2020-01-02-e2e-jekyll-${id}.md`), `---\ntitle: ${jekyllTitle}\npublished: false\n---\n草稿正文`);
  // 依赖目录里的 Markdown 不会被当成文章
  await mkdir(path.join(root, "blog", "node_modules", "pkg"), { recursive: true });
  await writeFile(path.join(root, "blog", "node_modules", "pkg", "README.md"), "# 不该导入");

  try {
    await page.goto("/admin/tutorials");
    await page.getByRole("link", { name: "批量导入" }).click();
    await expect(page).toHaveURL(/\/admin\/tutorials\/import$/);
    await page.getByLabel("Markdown 文件夹").setInputFiles(path.join(root, "blog"));

    await expect(page.getByText(/找到 2 篇，已选 2 篇/)).toBeVisible();
    const hexoRow = page.getByRole("row").filter({ hasText: hexoTitle });
    await expect(hexoRow).toContainText("前端开发");
    await expect(hexoRow).toContainText("已发布");
    await expect(page.getByRole("row").filter({ hasText: jekyllTitle })).toContainText("草稿");
    await page.getByLabel(/保持原来的状态/).check();
    await page.getByRole("button", { name: "开始导入 2 篇" }).click();

    await expect(page.getByRole("heading", { name: "导入完成" })).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole("status")).toContainText("成功 2 篇");
    // 指向本机的外链图片被拒绝下载，保留原地址并提示
    await expect(page.getByText(/blocked\.png 没下载成功（不能下载内网或本机地址的图片）/)).toBeVisible();
    await expect(page.getByLabel("旧地址跳转规则（Nginx）")).toHaveValue(
      new RegExp(`location = "/2021/03/e2e-hexo-${id}/" \\{ return 301 /tutorials/e2e-hexo-${id}; \\}`),
    );

    const hexo = tutorial(`e2e-hexo-${id}`)!;
    expect(hexo.published).toBe(1);
    expect(new Date(hexo.createdAt).toISOString()).toBe("2021-03-01T01:00:00.000Z");
    expect(new Date(hexo.updatedAt).toISOString()).toBe("2021-03-01T01:00:00.000Z");
    expect(hexo.notifiedAt).not.toBeNull();
    expect(hexo.content).toMatch(/<img src="\/uploads\/[\w-]+\.webp"/);
    expect(hexo.content).toContain("http://127.0.0.1/blocked.png");
    const frontend = queryDatabase<{ id: number }>(`SELECT id FROM "Category" WHERE name = '前端开发'`);
    if (frontend) expect(hexo.categoryId).toBe(frontend.id);
    const tags = queryDatabase<{ names: string }>(
      `SELECT group_concat(t.name, ',') AS names FROM "TutorialTag" tt JOIN "Tag" t ON t.id = tt.tagId JOIN "Tutorial" u ON u.id = tt.tutorialId WHERE u.slug = ?`,
      `e2e-hexo-${id}`,
    )!;
    expect(tags.names.split(",").sort()).toEqual(["CSS", "E2E导入"].sort());

    const jekyll = tutorial(`e2e-jekyll-${id}`)!;
    expect(jekyll.published).toBe(0);
    expect(new Date(jekyll.createdAt).toISOString()).toBe("2020-01-01T16:00:00.000Z");
    expect(queryDatabase<{ n: number }>(`SELECT COUNT(*) AS n FROM "AuditLog" WHERE action = 'tutorial.import' AND detail LIKE 'Markdown：导入 2 篇%'`)!.n).toBeGreaterThan(0);

    await page.goto(`/tutorials/e2e-hexo-${id}`);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(hexoTitle);
    await expect(page.locator(".article-body img").first()).toHaveAttribute("src", /^\/uploads\//);
    // 保留下来的那张外链图片本来就打不开，不算页面错误
    expect(errors.filter((error) => !error.includes("blocked.png"))).toEqual([]);
  } finally {
    await deleteTutorialRow(page, hexoTitle);
    await deleteTutorialRow(page, jekyllTitle);
    await rm(root, { recursive: true, force: true });
  }
});

test("a WordPress export imports posts as drafts by default and skips pages", async ({ page }) => {
  const id = uniqueSuffix();
  const title = `E2E WordPress ${id}`;
  const file = path.join(os.tmpdir(), `e2e-wp-${id}.xml`);
  await writeFile(
    file,
    `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:content="http://purl.org/rss/1.0/modules/content/" xmlns:wp="http://wordpress.org/export/1.2/" xmlns:excerpt="http://wordpress.org/export/1.2/excerpt/">
<channel>
<title>旧站</title><link>https://old.example</link>
<item>
  <title>${title}</title>
  <link>https://old.example/archives/${id}</link>
  <content:encoded><![CDATA[第一段

第二段]]></content:encoded>
  <excerpt:encoded><![CDATA[]]></excerpt:encoded>
  <wp:post_id>1</wp:post_id>
  <wp:post_date_gmt><![CDATA[2019-09-09 09:09:09]]></wp:post_date_gmt>
  <wp:post_name><![CDATA[e2e-wp-${id}]]></wp:post_name>
  <wp:status><![CDATA[publish]]></wp:status>
  <wp:post_type><![CDATA[post]]></wp:post_type>
  <category domain="post_tag" nicename="wp"><![CDATA[WordPress迁移]]></category>
</item>
<item>
  <title>关于我们 ${id}</title>
  <wp:post_id>2</wp:post_id>
  <wp:status><![CDATA[publish]]></wp:status>
  <wp:post_type><![CDATA[page]]></wp:post_type>
</item>
</channel>
</rss>`,
  );

  try {
    await page.goto("/admin/tutorials/import");
    await page.getByLabel("WordPress 导出文件").setInputFiles(file);
    await expect(page.getByText(/WordPress（https:\/\/old\.example）：找到 1 篇/)).toBeVisible();
    await expect(page.getByText(/跳过 1 项/)).toBeVisible();
    await page.getByRole("button", { name: "开始导入 1 篇" }).click();
    await expect(page.getByRole("status")).toContainText("成功 1 篇", { timeout: 30_000 });
    await expect(page.getByRole("status")).toContainText("都是草稿");

    const row = tutorial(`e2e-wp-${id}`)!;
    expect(row.published).toBe(0);
    expect(new Date(row.createdAt).toISOString()).toBe("2019-09-09T09:09:09.000Z");
    expect(row.content).toBe("<p>第一段</p>\n<p>第二段</p>");
    await expect(page.getByLabel("旧地址跳转规则（Nginx）")).toHaveValue(new RegExp(`/archives/${id}`));

    // 不是 WordPress 导出文件时给出说明
    await page.getByRole("button", { name: "继续导入其他文件" }).click();
    const other = path.join(os.tmpdir(), `e2e-not-wp-${id}.xml`);
    await writeFile(other, "<root/>");
    await page.getByLabel("WordPress 导出文件").setInputFiles(other);
    await expect(page.getByText(/这不是 WordPress 的导出文件/)).toBeVisible();
    await rm(other, { force: true });
  } finally {
    await deleteTutorialRow(page, title);
    await rm(file, { force: true });
  }
});
