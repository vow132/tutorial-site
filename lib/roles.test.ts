import assert from "node:assert/strict";
import { test } from "node:test";
import { bylineOf, can, canEditTutorial, parseDisplayName, readRole, type Permission } from "./roles";

const ALL: Permission[] = ["dashboard", "account", "tutorials", "tutorials.others", "taxonomy", "about", "feedback", "import", "media", "site"];

test("owners can do everything, editors everything but site administration, authors only their own tutorials", () => {
  for (const permission of ALL) assert.equal(can("owner", permission), true, `owner ${permission}`);
  for (const permission of ALL) assert.equal(can("editor", permission), permission !== "site", `editor ${permission}`);
  const authorGrants = new Set<Permission>(["dashboard", "account", "tutorials"]);
  for (const permission of ALL) assert.equal(can("author", permission), authorGrants.has(permission), `author ${permission}`);
});

test("an unknown or missing role gets the least privilege", () => {
  for (const value of [undefined, null, "", "admin", "OWNER", 1, {}]) {
    assert.equal(readRole(value), "author", String(value));
    assert.equal(can(value, "site"), false);
    assert.equal(can(value, "tutorials.others"), false);
  }
});

test("authors can edit only their own tutorials; editors and owners can edit any", () => {
  const mine = { authorId: 7 };
  const theirs = { authorId: 8 };
  const orphan = { authorId: null };
  assert.equal(canEditTutorial({ id: 7, role: "author" }, mine), true);
  assert.equal(canEditTutorial({ id: 7, role: "author" }, theirs), false);
  assert.equal(canEditTutorial({ id: 7, role: "author" }, orphan), false);
  for (const role of ["editor", "owner"]) {
    assert.equal(canEditTutorial({ id: 7, role }, theirs), true, role);
    assert.equal(canEditTutorial({ id: 7, role }, orphan), true, role);
  }
});

test("bylines come only from the display name, never the login username", () => {
  assert.equal(bylineOf(null), null);
  assert.equal(bylineOf({ displayName: null }), null);
  assert.equal(bylineOf({ displayName: "   " }), null);
  assert.equal(bylineOf({ displayName: " 张三 " }), "张三");
  assert.deepEqual(parseDisplayName("  李  四 "), { value: "李 四" });
  assert.deepEqual(parseDisplayName(""), { value: null });
  assert.deepEqual(parseDisplayName(undefined), { value: null });
  assert.match((parseDisplayName("一".repeat(21)) as { error: string }).error, /最多 20 个字/);
  assert.match((parseDisplayName("<b>x</b>") as { error: string }).error, /< 或 >/);
});
