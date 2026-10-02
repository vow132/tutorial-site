import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test, { afterEach, beforeEach, type TestContext } from "node:test";
import {
  compareState, getSiteUpdateStatus, jobIsAlive, readUpdateJob,
  runningRevision, startSiteUpdate,
} from "./site-update";
import type { UpdateJob } from "./site-update-types";

const CURRENT = "a".repeat(40);
const LATEST = "b".repeat(40);
const environmentKeys = [
  "NODE_ENV", "SITE_BUILD_REVISION", "SITE_UPDATE_BRANCH", "SITE_UPDATE_ROOT",
  "SITE_AUTO_UPDATE", "GITHUB_TOKEN",
] as const;
let root: string;
let originalEnvironment: Record<string, string | undefined>;

beforeEach(async () => {
  originalEnvironment = Object.fromEntries(environmentKeys.map((key) => [key, process.env[key]]));
  root = await mkdtemp(path.join(tmpdir(), "tutorial-site-update-test-"));
  Object.assign(process.env, {
    NODE_ENV: "test", SITE_BUILD_REVISION: CURRENT,
    SITE_UPDATE_BRANCH: `test-${randomUUID()}`, SITE_UPDATE_ROOT: root,
  });
  delete process.env.SITE_AUTO_UPDATE;
  delete process.env.GITHUB_TOKEN;
});

afterEach(async () => {
  for (const key of environmentKeys) {
    const value = originalEnvironment[key];
    if (value === undefined) delete process.env[key];
    else Object.assign(process.env, { [key]: value });
  }
  // Cleanup may only remove the fresh fixture inside the named temp directory.
  assert.ok(path.resolve(root).startsWith(path.join(path.resolve(tmpdir()), "tutorial-site-update-test-")));
  await rm(root, { recursive: true, force: true });
});

function mockGithub(t: TestContext, responses: Array<{ body: unknown; status?: number }>) {
  const urls: string[] = [];
  const fetchMock = t.mock.method(globalThis, "fetch", async (input: string | URL | Request) => {
    urls.push(String(input));
    const response = responses.shift();
    assert.ok(response, "Unexpected GitHub request; all network calls must be mocked");
    return Response.json(response.body, { status: response.status || 200 });
  });
  return { urls, fetchMock };
}

function job(overrides: Partial<UpdateJob> = {}): UpdateJob {
  const now = new Date().toISOString();
  return {
    jobId: randomUUID(), state: "running", phase: "building", message: "正在构建新版本。",
    targetRevision: LATEST, startedAt: now, updatedAt: now, ...overrides,
  };
}

async function writeJob(value: unknown) {
  await mkdir(path.join(root, ".updates"), { recursive: true });
  await writeFile(path.join(root, ".updates/status.json"), JSON.stringify(value));
}

test("GitHub comparison only offers a fast-forward update", () => {
  assert.equal(compareState(CURRENT, CURRENT), "current");
  assert.equal(compareState(CURRENT, LATEST, "identical"), "current");
  assert.equal(compareState(CURRENT, LATEST, "behind"), "current");
  assert.equal(compareState(CURRENT, LATEST, "ahead"), "available");
  assert.equal(compareState(CURRENT, LATEST, "diverged"), "unavailable");
  assert.equal(compareState(CURRENT, LATEST), "unavailable");
});

test("running revision comes from the build value even after checkout HEAD changes", async () => {
  await mkdir(path.join(root, ".git"));
  await writeFile(path.join(root, ".git/HEAD"), `${LATEST}\n`);
  assert.equal(runningRevision(), CURRENT);
  for (const invalid of ["", "main", "a".repeat(39), "A".repeat(40)]) {
    process.env.SITE_BUILD_REVISION = invalid;
    assert.equal(runningRevision(), null);
  }
  delete process.env.SITE_BUILD_REVISION;
  assert.equal(runningRevision(), null);
});

test("an unrecognized running revision never checks GitHub or authorizes updating", async (t) => {
  delete process.env.SITE_BUILD_REVISION;
  const { fetchMock } = mockGithub(t, []);
  const status = await getSiteUpdateStatus();
  assert.equal(status.state, "unavailable");
  assert.equal(status.canUpdate, false);
  assert.equal(status.currentRevision, null);
  assert.equal(fetchMock.mock.callCount(), 0);
});

test("matching revisions are current and only need the branch commit request", async (t) => {
  process.env.SITE_UPDATE_BRANCH = `release/教程-${randomUUID()}`;
  const { urls } = mockGithub(t, [{ body: { sha: CURRENT } }]);
  const status = await getSiteUpdateStatus();
  assert.equal(status.state, "current");
  assert.equal(status.canUpdate, false);
  assert.equal(status.latestRevision, CURRENT);
  assert.deepEqual(urls, [
    `https://api.github.com/repos/vow132/tutorial-site/commits/${encodeURIComponent(process.env.SITE_UPDATE_BRANCH)}`,
  ]);
});

test("new commits are shown as available but local development cannot deploy", async (t) => {
  const { urls } = mockGithub(t, [{ body: { sha: LATEST } }, { body: { status: "ahead" } }]);
  const status = await getSiteUpdateStatus();
  assert.equal(status.state, "available");
  assert.equal(status.canUpdate, false);
  assert.equal(status.currentRevision, CURRENT);
  assert.equal(status.latestRevision, LATEST);
  assert.match(status.message, /Linux.*PM2/);
  assert.equal(urls[1], `https://api.github.com/repos/vow132/tutorial-site/compare/${CURRENT}...${LATEST}`);
});

for (const [comparison, expected] of [["behind", "current"], ["diverged", "unavailable"]] as const) {
  test(`${comparison} histories cannot start an update`, async (t) => {
    mockGithub(t, [{ body: { sha: LATEST } }, { body: { status: comparison } }]);
    const status = await getSiteUpdateStatus();
    assert.equal(status.state, expected);
    assert.equal(status.canUpdate, false);
  });
}

test("successful checks are cached for five minutes, then checked again", async (t) => {
  let now = Date.now();
  t.mock.method(Date, "now", () => now);
  const { fetchMock } = mockGithub(t, [{ body: { sha: CURRENT } }, { body: { sha: CURRENT } }]);
  await getSiteUpdateStatus();
  now += 5 * 60_000 - 1;
  await getSiteUpdateStatus();
  assert.equal(fetchMock.mock.callCount(), 1);
  now += 2;
  await getSiteUpdateStatus();
  assert.equal(fetchMock.mock.callCount(), 2);
});

test("concurrent status checks share one GitHub lookup", async (t) => {
  let release!: () => void;
  let started!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  const requestStarted = new Promise<void>((resolve) => { started = resolve; });
  const fetchMock = t.mock.method(globalThis, "fetch", async () => {
    started();
    await gate;
    return Response.json({ sha: CURRENT });
  });
  const first = getSiteUpdateStatus();
  await requestStarted;
  const second = getSiteUpdateStatus();
  release();
  const statuses = await Promise.all([first, second]);
  assert.deepEqual(statuses[0], statuses[1]);
  assert.equal(fetchMock.mock.callCount(), 1);
});

for (const [httpStatus, message] of [[403, /GitHub 请求受限/], [429, /GitHub 请求受限/], [404, /分支或版本/], [500, /暂时无法/]] as const) {
  test(`GitHub HTTP ${httpStatus} produces a retryable error without deployment`, async (t) => {
    mockGithub(t, [{ body: { message: "API error" }, status: httpStatus }]);
    const status = await getSiteUpdateStatus();
    assert.equal(status.state, "error");
    assert.equal(status.canUpdate, false);
    assert.match(status.message, message);
  });
}

test("failed checks retry after one minute instead of the successful five-minute cache", async (t) => {
  let now = Date.now();
  t.mock.method(Date, "now", () => now);
  const { fetchMock } = mockGithub(t, [{ body: {}, status: 500 }, { body: { sha: CURRENT } }]);
  assert.equal((await getSiteUpdateStatus()).state, "error");
  now += 59_999;
  assert.equal((await getSiteUpdateStatus()).state, "error");
  assert.equal(fetchMock.mock.callCount(), 1);
  now += 2;
  assert.equal((await getSiteUpdateStatus()).state, "current");
  assert.equal(fetchMock.mock.callCount(), 2);
});

test("malformed GitHub revision data is rejected", async (t) => {
  mockGithub(t, [{ body: { sha: "not-a-commit" } }]);
  const status = await getSiteUpdateStatus();
  assert.equal(status.state, "error");
  assert.equal(status.canUpdate, false);
  assert.match(status.message, /版本信息无效/);
});

test("a running worker takes precedence over GitHub and disables another update", async (t) => {
  const active = job({ pid: process.pid });
  await writeJob(active);
  const { fetchMock } = mockGithub(t, []);
  const status = await getSiteUpdateStatus();
  assert.equal(status.state, "updating");
  assert.equal(status.canUpdate, false);
  assert.deepEqual(status.job, active);
  assert.equal(fetchMock.mock.callCount(), 0);
});

test("an interrupted worker reports failure without querying GitHub", async (t) => {
  t.mock.method(process, "kill", () => { throw Object.assign(new Error("No such process"), { code: "ESRCH" }); });
  await writeJob(job({ pid: 123456 }));
  const { fetchMock } = mockGithub(t, []);
  const status = await getSiteUpdateStatus();
  assert.equal(status.state, "error");
  assert.match(status.message, /更新进程已中断/);
  assert.equal(status.canUpdate, false);
  assert.equal(fetchMock.mock.callCount(), 0);
});

test("a worker without a PID has only a thirty-second startup grace period", () => {
  assert.equal(jobIsAlive(job()), true);
  assert.equal(jobIsAlive(job({ startedAt: new Date(Date.now() - 31_000).toISOString() })), false);
  assert.equal(jobIsAlive(job({ state: "success", pid: process.pid })), false);
});

test("permission-denied process checks still recognize the worker as alive", async (t) => {
  t.mock.method(process, "kill", () => { throw Object.assign(new Error("Permission denied"), { code: "EPERM" }); });
  assert.equal(jobIsAlive(job({ pid: 123456 })), true);
});

test("a failed worker retains its actionable failure message", async (t) => {
  const failed = job({ state: "error", message: "构建失败，已保留旧版本。" });
  await writeJob(failed);
  mockGithub(t, [{ body: { sha: LATEST } }, { body: { status: "ahead" } }]);
  const status = await getSiteUpdateStatus();
  assert.equal(status.state, "error");
  assert.equal(status.message, failed.message);
  assert.deepEqual(status.job, failed);
  assert.equal(status.canUpdate, false);
});

test("a completed worker no longer masks the running build revision", async (t) => {
  await writeJob(job({ state: "success" }));
  mockGithub(t, [{ body: { sha: LATEST } }, { body: { status: "ahead" } }]);
  const status = await getSiteUpdateStatus();
  assert.equal(status.state, "available");
  assert.equal(status.currentRevision, CURRENT);
  assert.equal(status.job?.state, "success");
});

test("a worker crash after switching to its target build recovers the current status", async (t) => {
  t.mock.method(process, "kill", () => { throw Object.assign(new Error("No such process"), { code: "ESRCH" }); });
  await writeJob(job({ pid: 123456, targetRevision: CURRENT }));
  const { fetchMock } = mockGithub(t, [{ body: { sha: CURRENT } }]);
  const status = await getSiteUpdateStatus();
  assert.equal(status.state, "current");
  assert.equal(status.canUpdate, false);
  assert.equal(status.job?.state, "success");
  assert.equal(status.currentRevision, CURRENT);
  assert.equal(fetchMock.mock.callCount(), 1);
});

test("a successful manual deployment recovers an old failure for the same target", async (t) => {
  await writeJob(job({ state: "error", targetRevision: CURRENT, message: "旧更新失败。" }));
  mockGithub(t, [{ body: { sha: CURRENT } }]);
  const status = await getSiteUpdateStatus();
  assert.equal(status.state, "current");
  assert.equal(status.job?.state, "success");
  assert.equal(status.canUpdate, false);
  assert.doesNotMatch(status.message, /旧更新失败/);
});

test("recovering a completed switch still detects newer repository commits", async (t) => {
  t.mock.method(process, "kill", () => { throw Object.assign(new Error("No such process"), { code: "ESRCH" }); });
  await writeJob(job({ pid: 123456, targetRevision: CURRENT }));
  const { fetchMock } = mockGithub(t, [{ body: { sha: LATEST } }, { body: { status: "ahead" } }]);
  const status = await getSiteUpdateStatus();
  assert.equal(status.state, "available");
  assert.equal(status.job?.state, "success");
  assert.equal(status.currentRevision, CURRENT);
  assert.equal(status.latestRevision, LATEST);
  assert.equal(fetchMock.mock.callCount(), 2);
});

test("an obsolete failed target does not mask an already-current repository", async (t) => {
  await writeJob(job({ state: "error", targetRevision: LATEST, message: "旧版本更新失败。" }));
  mockGithub(t, [{ body: { sha: CURRENT } }]);
  const status = await getSiteUpdateStatus();
  assert.equal(status.state, "current");
  assert.equal(status.canUpdate, false);
  assert.equal(status.latestRevision, CURRENT);
  assert.doesNotMatch(status.message, /旧版本更新失败/);
});

test("missing and invalid job records are ignored", async () => {
  assert.equal(await readUpdateJob(), undefined);
  await writeJob(job({ targetRevision: "invalid" }));
  assert.equal(await readUpdateJob(), undefined);
  await writeJob(job({ startedAt: "invalid" }));
  assert.equal(await readUpdateJob(), undefined);
});

test("concurrent local update requests reject before GitHub or worker launch", async (t) => {
  const { fetchMock } = mockGithub(t, []);
  const first = startSiteUpdate();
  const second = startSiteUpdate();
  assert.equal(first, second);
  await assert.rejects(first, /Linux.*PM2/);
  await assert.rejects(second, /Linux.*PM2/);
  assert.equal(fetchMock.mock.callCount(), 0);
  assert.equal(await readUpdateJob(), undefined);
});
