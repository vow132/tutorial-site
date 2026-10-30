import assert from "node:assert/strict";
import { access, copyFile, mkdir, mkdtemp, readdir, readFile, rm, symlink, utimes, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { assertBranch, databaseFile, isExpectedOrigin, performUpdate, pruneUpdateArtifacts } from "./site-update.mjs";

const CURRENT = "a".repeat(40);
const TARGET = "b".repeat(40);
const JOB = "test-job-123456";

test("the repository allowlist rejects credentials, other owners and injected URLs", () => {
  for (const origin of ["https://github.com/vow132/tutorial-site.git", "git@github.com:vow132/tutorial-site.git", "ssh://git@github.com/vow132/tutorial-site"]) assert.equal(isExpectedOrigin(origin), true);
  for (const origin of ["https://user:token@github.com/vow132/tutorial-site.git", "https://github.com/vow132/lumistar-license-platform.git", "https://github.com.evil.test/vow132/tutorial-site.git", "git@github.com:someone/tutorial-site.git", "https://github.com/vow132/tutorial-site.git; touch /tmp/x"]) assert.equal(isExpectedOrigin(origin), false);
});

test("branch and database validation reject unsafe/nonpersistent inputs", () => {
  assert.equal(assertBranch("master"), "master");
  assert.equal(assertBranch("release/v2"), "release/v2");
  for (const branch of ["--upload-pack=evil", "foo..bar", "a//b", "release.lock", "master;echo hi"]) assert.throws(() => assertBranch(branch));
  const root = path.resolve("example");
  assert.equal(databaseFile("file:./prisma/dev.db?connection_limit=1", root), path.join(root, "prisma", "dev.db"));
  assert.throws(() => databaseFile("postgres://user:password@localhost/db", root));
  assert.throws(() => databaseFile("file::memory:", root));
});

async function fixture(t, options = {}) {
  const root = await mkdtemp(path.join(os.tmpdir(), "tutorial-update-"));
  t.after(() => {
    assert.equal(path.dirname(root), path.resolve(os.tmpdir()));
    assert.ok(path.basename(root).startsWith("tutorial-update-"));
    return rm(root, { recursive: true, force: true });
  });
  const updates = path.join(root, ".updates");
  const database = path.join(root, "prisma", "dev.db");
  const next = path.join(root, "node_modules", "next", "dist", "bin", "next");
  await mkdir(path.dirname(database), { recursive: true });
  await mkdir(path.dirname(next), { recursive: true });
  await mkdir(path.join(updates, "update.lock"), { recursive: true });
  await writeFile(database, "original database");
  await writeFile(next, "next executable");
  await writeFile(path.join(root, "package.json"), "{}");
  await writeFile(path.join(root, ".env.production"), "AUTH_SECRET=fixture-secret\n");
  await writeFile(path.join(updates, "status.json"), JSON.stringify({ jobId: JOB, state: "running", phase: "queued", targetRevision: TARGET, startedAt: new Date().toISOString(), updatedAt: new Date().toISOString() }));
  const calls = [];
  const errors = [];
  let app = {
    name: "教程网",
    pm2_env: { pm_cwd: root, pm_exec_path: next, args: ["start"], exec_mode: "fork_mode", status: "online", env: { PORT: "3000", AUTH_SECRET: "fixture-secret" } },
  };
  let gitStatusCalls = 0;
  const run = async (command, args, execution) => {
    calls.push({ command, args, ...execution });
    if (command === "git") {
      if (args[0] === "remote" && args[1] === "get-url") return options.origin || "https://github.com/vow132/tutorial-site.git";
      if (args[0] === "status") {
        gitStatusCalls++;
        return options.dirty || (options.dirtyDuringBuild && gitStatusCalls > 1) ? " M app/page.tsx" : "";
      }
      if (args[0] === "rev-parse") return args[1] === "FETCH_HEAD" ? (options.fetched || TARGET) : CURRENT;
      if (args[0] === "merge-base" && options.divergent) throw new Error("not an ancestor");
      if (args[0] === "clone") {
        const release = args.at(-1);
        await mkdir(path.join(release, "public"), { recursive: true });
        await mkdir(path.join(release, "node_modules", "prisma", "build"), { recursive: true });
        await writeFile(path.join(release, "package.json"), "{}");
      }
      return "";
    }
    if (command === "pm2") {
      if (args[0] === "jlist") return JSON.stringify(app ? [app] : []);
      if (args[0] === "stop") {
        // This write represents activity while the staged build was running.
        await writeFile(database, "latest database before stop");
        app.pm2_env.status = "stopped";
      }
      if (args[0] === "delete") app = undefined;
      if (args[0] === "start") {
        const source = await readFile(args[1], "utf8");
        const config = JSON.parse(source.slice("module.exports = ".length, source.lastIndexOf(";"))).apps[0];
        app = { name: config.name, pm2_env: { pm_cwd: config.cwd, pm_exec_path: config.script, env: config.env, exec_mode: "fork_mode", status: "online" } };
      }
      return "";
    }
    if (command === "npm" && args[0] === "run") {
      if (options.buildFails) throw new Error("build contains secret: fixture-secret");
      return "";
    }
    if (args.includes("migrate") && execution.env.DATABASE_URL === `file:${database}`) {
      await writeFile(database, "migrated database");
      if (options.liveMigrationFails) throw new Error("migration failed");
    }
    return "";
  };
  const backup = async (source, target) => { calls.push({ command: "backup", source, target }); await copyFile(source, target); };
  const health = async (revision, port) => {
    calls.push({ command: "health", revision, port });
    if ((options.healthFails && revision === TARGET) || (options.rollbackHealthFails && revision === CURRENT)) throw new Error("wrong deployed revision");
  };
  const result = await performUpdate({ root, targetRevision: TARGET, jobId: JOB }, {
    platform: "linux", env: { NODE_ENV: "production", SITE_AUTO_UPDATE: "true", DATABASE_URL: `file:${database}`, SITE_CURRENT_REVISION: CURRENT },
    run, backup, health, link: (source, target) => symlink(source, target, process.platform === "win32" ? "junction" : "dir"),
    logError: (...items) => errors.push(items.map((item) => item instanceof Error ? item.message : item).join(" ")),
  });
  return {
    root, database, calls, result, app, errors,
    status: JSON.parse(await readFile(path.join(updates, "status.json"), "utf8")),
    async lockExists() { try { await access(path.join(updates, "update.lock")); return true; } catch { return false; } },
  };
}

test("successful update builds against a snapshot before stopping and activates the pinned revision", async (t) => {
  const f = await fixture(t);
  assert.equal(f.result.success, true, f.errors.join("\n"));
  assert.equal(f.status.state, "success");
  assert.equal(await f.lockExists(), false);
  const build = f.calls.findIndex((call) => call.command === "npm" && call.args[0] === "run");
  const stop = f.calls.findIndex((call) => call.command === "pm2" && call.args[0] === "stop");
  assert.ok(build >= 0 && stop > build);
  assert.notEqual(f.calls[build].env.DATABASE_URL, `file:${f.database}`);
  assert.deepEqual(f.calls.find((call) => call.command === "npm" && call.args[0] === "ci").args, ["ci", "--include=dev"]);
  assert.deepEqual(f.calls.find((call) => call.command === "git" && call.args[0] === "fetch").args, ["fetch", "--no-tags", "origin", "master"]);
  assert.equal(f.app.pm2_env.pm_cwd, path.join(f.root, ".updates", "releases", JOB));
  assert.equal(f.app.pm2_env.env.DATABASE_URL, `file:${f.database}`);
  assert.equal(f.app.pm2_env.env.SITE_DEPLOYED_REVISION, TARGET);
  assert.equal(f.app.pm2_env.env.SITE_UPDATE_ROOT, f.root);
  assert.equal(f.app.pm2_env.env.SITE_CURRENT_REVISION, undefined);
  assert.equal(await readFile(f.database, "utf8"), "migrated database");
  assert.equal(await readFile(path.join(f.root, ".updates", `database-${JOB}.db`), "utf8"), "latest database before stop");
  assert.equal(f.calls.find((call) => call.command === "health").revision, TARGET);
});

test("a failed staged build leaves the original running process and database untouched", async (t) => {
  const f = await fixture(t, { buildFails: true });
  assert.equal(f.result.success, false);
  assert.equal(f.status.state, "error");
  assert.equal(await f.lockExists(), false);
  assert.equal(await readFile(f.database, "utf8"), "original database");
  assert.equal(f.app.pm2_env.status, "online");
  assert.equal(f.calls.some((call) => call.command === "pm2" && ["stop", "delete", "start"].includes(call.args[0])), false);
  assert.equal(f.status.message.includes("fixture-secret"), false);
});

test("failed live migrations restore the latest stopped database and previous PM2 configuration", async (t) => {
  const f = await fixture(t, { liveMigrationFails: true });
  assert.equal(f.result.success, false);
  assert.equal(f.result.rollbackFailed, false);
  assert.equal(await readFile(f.database, "utf8"), "latest database before stop");
  assert.equal(f.app.pm2_env.pm_cwd, f.root);
  assert.equal(f.app.pm2_env.status, "online");
  assert.equal(f.status.message.includes("已恢复原版本"), true);
  assert.equal(await f.lockExists(), false);
});

test("failed health checks roll back both database and deployed process", async (t) => {
  const f = await fixture(t, { healthFails: true });
  assert.equal(f.result.success, false);
  assert.equal(f.result.rollbackFailed, false);
  assert.equal(await readFile(f.database, "utf8"), "latest database before stop");
  assert.equal(f.app.pm2_env.pm_cwd, f.root);
  assert.equal(f.calls.filter((call) => call.command === "pm2" && call.args[0] === "start").length, 2);
  assert.deepEqual(f.calls.filter((call) => call.command === "health").map((call) => call.revision), [TARGET, CURRENT]);
});

test("an unhealthy previous service reports rollback failure instead of claiming recovery", async (t) => {
  const f = await fixture(t, { healthFails: true, rollbackHealthFails: true });
  assert.equal(f.result.success, false);
  assert.equal(f.result.rollbackFailed, true);
  assert.equal(f.status.state, "error");
  assert.equal(f.status.message.includes("自动恢复未完成"), true);
  assert.equal(f.status.message.includes("已恢复原版本"), false);
  assert.equal(await f.lockExists(), false);
  assert.equal(await readFile(f.database, "utf8"), "latest database before stop");
});

for (const [name, options] of [
  ["uncommitted changes", { dirty: true }],
  ["unexpected Git origin", { origin: "https://github.com/vow132/lumistar-license-platform.git" }],
  ["a changed remote revision", { fetched: "c".repeat(40) }],
  ["divergent history", { divergent: true }],
  ["local changes arriving during the build", { dirtyDuringBuild: true }],
]) {
  test(`rejects ${name} before stopping the live process`, async (t) => {
    const f = await fixture(t, options);
    assert.equal(f.result.success, false);
    assert.equal(await f.lockExists(), false);
    assert.equal(await readFile(f.database, "utf8"), "original database");
    assert.equal(f.calls.some((call) => call.command === "pm2" && ["stop", "delete", "start"].includes(call.args[0])), false);
  });
}

test("pruning keeps recent releases and backups but never the protected ones", async (t) => {
  const updates = await mkdtemp(path.join(os.tmpdir(), "tutorial-prune-"));
  t.after(() => rm(updates, { recursive: true, force: true }));
  const releases = path.join(updates, "releases");
  const stamp = (n) => new Date(Date.UTC(2026, 0, 1, 0, n));
  for (let n = 1; n <= 6; n++) {
    const release = path.join(releases, `release-job-${n}`);
    await mkdir(release, { recursive: true });
    await utimes(release, stamp(n), stamp(n));
    const backup = path.join(updates, `database-release-job-${n}.db`);
    await writeFile(backup, "backup");
    await utimes(backup, stamp(n), stamp(n));
  }
  await writeFile(path.join(updates, "status.json"), "{}");
  // The oldest release is still the rollback target, the newest is live.
  const removed = await pruneUpdateArtifacts(updates, {
    protect: [path.join(releases, "release-job-1"), path.join(releases, "release-job-6")],
    keepReleases: 2,
    keepBackups: 3,
  });
  assert.deepEqual((await readdir(releases)).sort(), ["release-job-1", "release-job-4", "release-job-5", "release-job-6"]);
  assert.deepEqual(
    (await readdir(updates)).filter((name) => name.startsWith("database-")).sort(),
    ["database-release-job-4.db", "database-release-job-5.db", "database-release-job-6.db"],
  );
  assert.ok(await readFile(path.join(updates, "status.json"), "utf8"));
  assert.equal(removed.length, 5);
});
