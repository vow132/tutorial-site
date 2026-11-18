-- 中文两字词搜索：正文里的汉字按两两相邻切成词（指纹识别 → 指纹 纹识 识别），
-- 由应用代码维护（lib/search-index.ts），rowid 对应 Tutorial.id，updatedAt 用来判断是否需要重建。
CREATE VIRTUAL TABLE "TutorialBigram" USING fts5(
  "terms",
  "updatedAt" UNINDEXED,
  tokenize='unicode61'
);
