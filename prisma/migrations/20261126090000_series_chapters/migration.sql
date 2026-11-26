-- 系列里的章节名（只用 ADD COLUMN，不重建 Tutorial 表，见 AGENTS.md）
ALTER TABLE "Tutorial" ADD COLUMN "seriesChapter" TEXT;
