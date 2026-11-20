-- 教程系列
CREATE TABLE "Series" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "title" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

CREATE UNIQUE INDEX "Series_slug_key" ON "Series"("slug");

-- 只用 ADD COLUMN：Prisma 默认生成的「重建 Tutorial 表」会顺带删掉全文搜索的触发器
ALTER TABLE "Tutorial" ADD COLUMN "seriesId" INTEGER REFERENCES "Series" ("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Tutorial" ADD COLUMN "seriesOrder" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Tutorial" ADD COLUMN "helpfulYes" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Tutorial" ADD COLUMN "helpfulNo" INTEGER NOT NULL DEFAULT 0;

CREATE INDEX "Tutorial_seriesId_seriesOrder_idx" ON "Tutorial"("seriesId", "seriesOrder");

-- 每篇教程每天的阅读量（北京时间 YYYY-MM-DD）
CREATE TABLE "TutorialDailyView" (
    "tutorialId" INTEGER NOT NULL,
    "day" TEXT NOT NULL,
    "views" INTEGER NOT NULL DEFAULT 0,

    PRIMARY KEY ("tutorialId", "day"),
    CONSTRAINT "TutorialDailyView_tutorialId_fkey" FOREIGN KEY ("tutorialId") REFERENCES "Tutorial" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "TutorialDailyView_day_idx" ON "TutorialDailyView"("day");
