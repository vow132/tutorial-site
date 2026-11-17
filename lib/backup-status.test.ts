import assert from "node:assert/strict";
import test from "node:test";
import { BACKUP_STALE_MS, describeBackup, shouldRemindBackup } from "./backup-status";

const now = Date.parse("2026-11-16T12:00:00Z");
const hoursAgo = (hours: number) => new Date(now - hours * 3_600_000);

test("backup reminders fire when stale, at most once a day", () => {
  assert.equal(shouldRemindBackup({ latestAt: hoursAgo(10), now }), false);
  assert.equal(shouldRemindBackup({ latestAt: hoursAgo(49), now }), true);
  assert.equal(shouldRemindBackup({ latestAt: null, now }), true);
  assert.equal(shouldRemindBackup({ latestAt: null, lastReminderAt: hoursAgo(3).toISOString(), now }), false);
  assert.equal(shouldRemindBackup({ latestAt: null, lastReminderAt: hoursAgo(25).toISOString(), now }), true);
});

test("dashboard text describes backup age and staleness", () => {
  const fresh = describeBackup({ directory: "/b", count: 3, latest: { name: "x", at: hoursAgo(5), size: 1_572_864 } }, now);
  assert.equal(fresh.text, "5 小时前（1.5 MB，共保留 3 份）");
  assert.equal(fresh.stale, false);
  const stale = describeBackup({ directory: "/b", count: 1, latest: { name: "x", at: new Date(now - BACKUP_STALE_MS), size: 0 } }, now);
  assert.equal(stale.stale, true);
  assert.deepEqual(describeBackup({ directory: "/b", count: 0, latest: null }, now), { text: "还没有备份", stale: true });
});
