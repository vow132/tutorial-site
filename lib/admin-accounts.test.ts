import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { after, before, beforeEach, test } from "node:test";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { PrismaClient } from "../generated/prisma/client";
import { applyMigrations } from "../scripts/migrate.mjs";
import { changeAccount, removeAccount } from "./admin-accounts";

const LOST_OWNER_MESSAGE = "lostOwner";

/*
 * 「至少留一个站长」在并发下也成立：用真实的 SQLite（套用全部迁移）和与线上相同的 Prisma 适配器，
 * 让两个站长同时互相降级、同时互相删除，只能成功一个。
 */
const dir = mkdtempSync(path.join(os.tmpdir(), "admin-accounts-"));
const file = path.join(dir, "test.db");
let db: PrismaClient;

before(() => {
  applyMigrations(file, path.resolve(import.meta.dirname, "..", "prisma", "migrations"));
  db = new PrismaClient({ adapter: new PrismaBetterSqlite3({ url: `file:${file}`, timeout: 5000 }) });
});

after(async () => {
  await db.$disconnect();
  rmSync(dir, { recursive: true, force: true });
});

beforeEach(async () => {
  await db.tutorial.deleteMany();
  await db.category.deleteMany();
  await db.admin.deleteMany();
});

const account = (username: string, role: string) => db.admin.create({ data: { username, role, password: "x" } });
const owners = () => db.admin.count({ where: { role: "owner" } });

test("two owners demoting each other at the same time: only one succeeds", async () => {
  const a = await account("owner-a", "owner");
  const b = await account("owner-b", "owner");
  const results = await Promise.all([
    changeAccount(db, { actorId: a.id, targetId: b.id, role: "editor", displayName: null }),
    changeAccount(db, { actorId: b.id, targetId: a.id, role: "editor", displayName: null }),
  ]);
  assert.equal(results.filter((r) => "previousRole" in r).length, 1);
  assert.deepEqual(results.find((r) => "error" in r), { error: LOST_OWNER_MESSAGE });
  assert.equal(await owners(), 1);
});

test("two owners deleting each other at the same time: only one succeeds", async () => {
  const a = await account("owner-a", "owner");
  const b = await account("owner-b", "owner");
  const results = await Promise.all([
    removeAccount(db, { actorId: a.id, targetId: b.id }),
    removeAccount(db, { actorId: b.id, targetId: a.id }),
  ]);
  assert.equal(results.filter((r) => "moved" in r).length, 1);
  assert.equal(await db.admin.count(), 1);
  assert.equal(await owners(), 1);
});

test("an owner who was just demoted can no longer change or delete accounts", async () => {
  const a = await account("owner-a", "owner");
  const b = await account("owner-b", "owner");
  const writer = await account("writer", "author");
  assert.ok("previousRole" in (await changeAccount(db, { actorId: a.id, targetId: b.id, role: "editor", displayName: null })));
  assert.deepEqual(await changeAccount(db, { actorId: b.id, targetId: writer.id, role: "owner", displayName: null }), {
    error: LOST_OWNER_MESSAGE,
  });
  assert.deepEqual(await removeAccount(db, { actorId: b.id, targetId: writer.id }), { error: LOST_OWNER_MESSAGE });
  assert.equal((await db.admin.findUniqueOrThrow({ where: { id: writer.id } })).role, "author");
});

test("own role cannot change; display name and other people's roles can", async () => {
  const a = await account("owner-a", "owner");
  const writer = await account("writer", "author");
  assert.deepEqual(await changeAccount(db, { actorId: a.id, targetId: a.id, role: "editor", displayName: null }), {
    error: "ownRole",
  });
  assert.deepEqual(await changeAccount(db, { actorId: a.id, targetId: a.id, role: "owner", displayName: "站长" }), {
    previousRole: "owner",
  });
  assert.deepEqual(await changeAccount(db, { actorId: a.id, targetId: writer.id, role: "editor", displayName: "小王" }), {
    previousRole: "author",
  });
  const updated = await db.admin.findUniqueOrThrow({ where: { id: writer.id } });
  assert.equal(updated.role, "editor");
  assert.equal(updated.displayName, "小王");
});

test("deleting an account moves its tutorials to the owner who deleted it", async () => {
  const a = await account("owner-a", "owner");
  const writer = await account("writer", "author");
  const category = await db.category.create({ data: { name: "测试", slug: "test" } });
  await db.tutorial.createMany({
    data: [1, 2].map((n) => ({ title: `t${n}`, slug: `t${n}`, content: "<p>x</p>", categoryId: category.id, authorId: writer.id })),
  });
  assert.deepEqual(await removeAccount(db, { actorId: a.id, targetId: writer.id }), { moved: 2 });
  assert.equal(await db.tutorial.count({ where: { authorId: a.id } }), 2);
  assert.deepEqual(await removeAccount(db, { actorId: a.id, targetId: writer.id }), { error: "notFound" });
  assert.deepEqual(await removeAccount(db, { actorId: a.id, targetId: a.id }), { error: "deleteSelf" });
});
