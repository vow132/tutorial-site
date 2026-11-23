-- 新教程通知：每篇只发一次。已经发布的教程视为「已通知」，上线后改动它们不会给订阅者发邮件
ALTER TABLE "Tutorial" ADD COLUMN "notifiedAt" DATETIME;
UPDATE "Tutorial" SET "notifiedAt" = "updatedAt" WHERE "published" = 1;

-- 邮件订阅者
CREATE TABLE "Subscriber" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "email" TEXT NOT NULL,
    "confirmedAt" DATETIME,
    "confirmSentAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX "Subscriber_email_key" ON "Subscriber"("email");
CREATE INDEX "Subscriber_confirmedAt_idx" ON "Subscriber"("confirmedAt");
