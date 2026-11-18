-- AlterTable
ALTER TABLE "Tutorial" ADD COLUMN "publishAt" DATETIME;

-- CreateTable
CREATE TABLE "TutorialRevision" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "tutorialId" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "excerpt" TEXT,
    "content" TEXT NOT NULL,
    "savedAt" DATETIME NOT NULL,
    "replacedBy" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TutorialRevision_tutorialId_fkey" FOREIGN KEY ("tutorialId") REFERENCES "Tutorial" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "TutorialRevision_tutorialId_savedAt_idx" ON "TutorialRevision"("tutorialId", "savedAt");

-- CreateIndex
CREATE INDEX "Tutorial_published_publishAt_idx" ON "Tutorial"("published", "publishAt");
