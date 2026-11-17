import assert from "node:assert/strict";
import test from "node:test";
import { sharedLimiter } from "./rate-limit";
import { SearchBusyError, isShortQuery, searchPublishedTutorials } from "./search";

test("short queries are detected by searchable characters", () => {
  assert.equal(isShortQuery("Gr"), true);
  assert.equal(isShortQuery("c++"), true);
  assert.equal(isShortQuery("实战"), true);
  assert.equal(isShortQuery("Flexbox"), false);
});

test("uncached searches stop at the site-wide budget without touching the database", async () => {
  const budget = sharedLimiter("search:global", 20, 5_000);
  for (let i = 0; i < 20; i++) budget.hit("all");
  await assert.rejects(searchPublishedTutorials(`budget-${Date.now()}`), (error: unknown) => {
    assert.ok(error instanceof SearchBusyError);
    assert.ok(error.retryAfterSeconds > 0 && error.retryAfterSeconds <= 5);
    return true;
  });
  budget.reset("all");
});
