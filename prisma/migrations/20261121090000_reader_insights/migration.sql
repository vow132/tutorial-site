-- 读完次数（每篇每天）
ALTER TABLE "TutorialDailyView" ADD COLUMN "completions" INTEGER NOT NULL DEFAULT 0;

-- 每天的搜索词统计
CREATE TABLE "SearchQueryDaily" (
    "day" TEXT NOT NULL,
    "query" TEXT NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,
    "results" INTEGER NOT NULL DEFAULT 0,

    PRIMARY KEY ("day", "query")
);
CREATE INDEX "SearchQueryDaily_day_idx" ON "SearchQueryDaily"("day");

-- 每天的阅读来源
CREATE TABLE "ReferrerDaily" (
    "day" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "views" INTEGER NOT NULL DEFAULT 0,

    PRIMARY KEY ("day", "source")
);
CREATE INDEX "ReferrerDaily_day_idx" ON "ReferrerDaily"("day");

-- 读者留言（只在后台可见）
CREATE TABLE "FeedbackMessage" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "tutorialId" INTEGER NOT NULL,
    "message" TEXT NOT NULL,
    "read" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "FeedbackMessage_tutorialId_fkey" FOREIGN KEY ("tutorialId") REFERENCES "Tutorial" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "FeedbackMessage_read_createdAt_idx" ON "FeedbackMessage"("read", "createdAt");
CREATE INDEX "FeedbackMessage_tutorialId_idx" ON "FeedbackMessage"("tutorialId");
