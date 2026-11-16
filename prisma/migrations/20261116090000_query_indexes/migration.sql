-- 文章数量上万后，这些查询原本要扫全表（better-sqlite3 是同步驱动，扫表期间整个进程卡住）。
-- 2 万篇实测：分类篇数 48ms → 3ms，后台列表 57ms → 0.4ms，sitemap 90ms → 40ms。

-- CreateIndex
CREATE INDEX "Tutorial_published_categoryId_createdAt_idx" ON "Tutorial"("published", "categoryId", "createdAt");

-- CreateIndex
CREATE INDEX "Tutorial_published_updatedAt_slug_idx" ON "Tutorial"("published", "updatedAt", "slug");

-- CreateIndex
CREATE INDEX "Tutorial_updatedAt_idx" ON "Tutorial"("updatedAt");
