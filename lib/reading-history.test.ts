import assert from "node:assert/strict";
import { test } from "node:test";
import { addToReadingHistory, parseReadingHistory, READING_HISTORY_LIMIT } from "./reading-history";

test("reading history keeps positive ids once, in the order they were read", () => {
  assert.deepEqual(parseReadingHistory("[3, 1, 3, -2, 1.5, \"4\", 7]"), [3, 1, 7]);
  assert.deepEqual(parseReadingHistory("not json"), []);
  assert.deepEqual(parseReadingHistory('{"a":1}'), []);
  assert.deepEqual(parseReadingHistory(null), []);
  assert.deepEqual(addToReadingHistory([1, 2, 3], 2), [1, 3, 2], "reading again moves it to the end");
});

test("reading history is capped, dropping the oldest", () => {
  const full = Array.from({ length: READING_HISTORY_LIMIT }, (_, index) => index + 1);
  const next = addToReadingHistory(full, 99999);
  assert.equal(next.length, READING_HISTORY_LIMIT);
  assert.equal(next[0], 2);
  assert.equal(next.at(-1), 99999);
});
