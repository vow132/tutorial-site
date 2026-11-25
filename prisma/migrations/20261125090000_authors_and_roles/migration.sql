-- 多作者与角色：后台账号加角色和署名，教程加作者。
-- 只用 ADD COLUMN（RedefineTables 会删掉全文搜索的触发器，见 AGENTS.md）。

-- 新账号默认是权限最小的作者；已有的账号都是原来的管理员，改成站长
ALTER TABLE "Admin" ADD COLUMN "role" TEXT NOT NULL DEFAULT 'author';
UPDATE "Admin" SET "role" = 'owner';
ALTER TABLE "Admin" ADD COLUMN "displayName" TEXT;

ALTER TABLE "Tutorial" ADD COLUMN "authorId" INTEGER REFERENCES "Admin" ("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "Tutorial_authorId_idx" ON "Tutorial"("authorId");
-- 已有的教程都算第一个账号写的
UPDATE "Tutorial" SET "authorId" = (SELECT "id" FROM "Admin" ORDER BY "id" LIMIT 1);
