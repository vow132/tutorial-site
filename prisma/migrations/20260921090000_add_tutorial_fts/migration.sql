CREATE VIRTUAL TABLE "TutorialSearch" USING fts5(
  "title",
  "excerpt",
  "content",
  content='Tutorial',
  content_rowid='id',
  tokenize='trigram'
);

INSERT INTO "TutorialSearch"("rowid", "title", "excerpt", "content")
SELECT "id", "title", COALESCE("excerpt", ''), "content"
FROM "Tutorial";

CREATE TRIGGER "tutorial_search_ai" AFTER INSERT ON "Tutorial" BEGIN
  INSERT INTO "TutorialSearch"("rowid", "title", "excerpt", "content")
  VALUES (new."id", new."title", COALESCE(new."excerpt", ''), new."content");
END;

CREATE TRIGGER "tutorial_search_ad" AFTER DELETE ON "Tutorial" BEGIN
  INSERT INTO "TutorialSearch"("TutorialSearch", "rowid", "title", "excerpt", "content")
  VALUES ('delete', old."id", old."title", COALESCE(old."excerpt", ''), old."content");
END;

CREATE TRIGGER "tutorial_search_au" AFTER UPDATE OF "title", "excerpt", "content" ON "Tutorial" BEGIN
  INSERT INTO "TutorialSearch"("TutorialSearch", "rowid", "title", "excerpt", "content")
  VALUES ('delete', old."id", old."title", COALESCE(old."excerpt", ''), old."content");
  INSERT INTO "TutorialSearch"("rowid", "title", "excerpt", "content")
  VALUES (new."id", new."title", COALESCE(new."excerpt", ''), new."content");
END;
