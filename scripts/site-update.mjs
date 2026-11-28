#!/usr/bin/env node
/** Detached Linux/PM2 updater. Run only through the authenticated update API. */
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { access, copyFile, lstat, mkdir, readdir, readFile, realpath, rename, rm, stat, symlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { scriptText, siteLocaleOfFile } from "../lib/script-i18n.mjs";

export const REPOSITORY = "https://github.com/vow132/tutorial-site.git";
const SHA = /^[a-f0-9]{40}$/;

/** 网站语言：读站点数据库的设置，读不到时返回 null（文字按简体中文）。 */
function readSiteLocale(configuredUrl, root) {
  try {
    const require = createRequire(path.join(root, "package.json"));
    return siteLocaleOfFile(require("better-sqlite3"), databaseFile(configuredUrl, root));
  } catch {
    return null;
  }
}
const JOB = /^[a-zA-Z0-9][a-zA-Z0-9_-]{7,79}$/;

export function isExpectedOrigin(origin) {
  return /^(?:https:\/\/github\.com\/|git@github\.com:|ssh:\/\/git@github\.com\/)vow132\/tutorial-site(?:\.git)?\/?$/.test(origin.trim());
}

export function databaseFile(configured, cwd) {
  const url = (configured || "file:./prisma/dev.db").trim();
  if (!url.startsWith("file:")) throw new Error("自动更新仅支持本地 SQLite 数据库。/ Only a local SQLite database is supported.");
  const file = url.slice(5).split("?")[0];
  if (!file || file === ":memory:") throw new Error("自动更新需要持久化 SQLite 数据库。/ A persistent SQLite database file is required.");
  return path.resolve(cwd, file);
}

export function assertBranch(branch) {
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._/-]*$/.test(branch) || branch.includes("..") || branch.endsWith("/") || branch.includes("//") || branch.endsWith(".lock")) {
    throw new Error("更新分支配置无效。/ Invalid update branch setting.");
  }
  return branch;
}

function within(parent, child) {
  const relative = path.relative(parent, child);
  return relative !== "" && !relative.startsWith(`..${path.sep}`) && relative !== ".." && !path.isAbsolute(relative);
}

async function exists(file) {
  try { await access(file); return true; } catch (error) { if (error.code === "ENOENT") return false; throw error; }
}

async function atomicJSON(file, value) {
  const temporary = `${file}.${process.pid}.tmp`;
  await writeFile(temporary, `${JSON.stringify(value)}\n`, { mode: 0o600 });
  await rename(temporary, file);
}

/** No shell: repository, revision and process name never become command text. */
export function runCommand(command, args, { cwd, env, capture = false, timeout = 20 * 60_000 } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd, env, shell: false, detached: process.platform === "linux", stdio: ["ignore", capture ? "pipe" : "inherit", "inherit"],
    });
    let output = "";
    let timer;
    let killTimer;
    let timedOut = false;
    child.stdout?.on("data", (chunk) => {
      output += chunk.toString();
      if (output.length > 2_000_000) { output = output.slice(-2_000_000); }
    });
    const kill = (signal) => {
      try {
        if (process.platform === "linux" && child.pid) process.kill(-child.pid, signal);
        else child.kill(signal);
      } catch { /* The command already exited. */ }
    };
    timer = setTimeout(() => {
      timedOut = true;
      kill("SIGTERM");
      killTimer = setTimeout(() => kill("SIGKILL"), 5000);
    }, timeout);
    const clear = () => { clearTimeout(timer); clearTimeout(killTimer); };
    child.once("error", (error) => { clear(); reject(error); });
    child.once("close", (code) => {
      clear();
      if (code !== 0 || timedOut) reject(new Error(`${command} ${args[0] || ""} ${timedOut ? "timed out" : `exited with ${code}`}`));
      else resolve(output.trim());
    });
  });
}

/**
 * 每次更新都会留下完整的发布目录（含 node_modules）、数据库备份和旧 PM2 配置。
 * 成功后只保留最近几份，长期运行也不会占满磁盘、散落 .env 副本。
 * protect 中的路径（正在运行的版本、回滚目标）永远不删。
 */
export async function pruneUpdateArtifacts(updates, { protect = [], keepReleases = 2, keepBackups = 5 } = {}) {
  const protectedPaths = new Set();
  for (const item of protect.filter(Boolean)) {
    protectedPaths.add(path.resolve(item));
    try { protectedPaths.add(await realpath(item)); } catch { /* Already gone. */ }
  }
  const list = async (directory, pattern, wantDirectory) => {
    let names;
    try { names = await readdir(directory); }
    catch (error) { if (error.code === "ENOENT") return []; throw error; }
    const items = [];
    for (const name of names) {
      if (!pattern.test(name)) continue;
      const full = path.join(directory, name);
      const info = await lstat(full);
      if (info.isDirectory() === wantDirectory && !info.isSymbolicLink()) items.push({ full, mtime: info.mtimeMs });
    }
    return items.sort((a, b) => b.mtime - a.mtime);
  };
  const removed = [];
  const prune = async (items, keep) => {
    let kept = 0;
    for (const item of items) {
      if (protectedPaths.has(item.full)) continue;
      if (kept < keep) { kept += 1; continue; }
      await rm(item.full, { recursive: true, force: true });
      removed.push(item.full);
    }
  };
  await prune(await list(path.join(updates, "releases"), JOB, true), keepReleases);
  await prune(await list(updates, /^database-[a-zA-Z0-9_-]+\.db$/, false), keepBackups);
  await prune(await list(updates, /^previous-[a-zA-Z0-9_-]+\.config\.cjs$/, false), keepBackups);
  return removed;
}

async function sqliteBackup(source, destination, moduleRoot) {
  const require = createRequire(path.join(moduleRoot, "package.json"));
  const Database = require("better-sqlite3");
  const db = new Database(source, { readonly: true, fileMustExist: true, timeout: 10_000 });
  try { await db.backup(destination); } finally { db.close(); }
}

/** 更新结果推送到后台配置的安全告警渠道；任何错误都只打印，不影响更新流程。 */
async function notifyUpdateResult(databasePath, moduleRoot, message) {
  try {
    const { notifyFromDatabase } = await import("../lib/alert-transport.mjs");
    const require = createRequire(path.join(moduleRoot, "package.json"));
    const Database = require("better-sqlite3");
    const db = new Database(databasePath, { readonly: true, fileMustExist: true, timeout: 10_000 });
    try {
      await notifyFromDatabase(db, message);
    } finally {
      db.close();
    }
  } catch (error) {
    console.error("[site-update] notify failed:", error instanceof Error ? error.message : error);
  }
}

async function health(revision, port) {
  const url = `http://127.0.0.1:${port}/admin/login`;
  for (let attempt = 0; attempt < 30; attempt++) {
    try {
      const response = await fetch(url, { cache: "no-store", redirect: "error", signal: AbortSignal.timeout(3000) });
      if (response.ok && response.headers.get("x-site-revision") === revision) return;
    } catch { /* A restarted process can need a few seconds to bind its port. */ }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  throw new Error("新版本健康检查失败。/ The new version failed its health check.");
}

function processConfig(app) {
  const env = app.pm2_env;
  return {
    name: app.name,
    cwd: env.pm_cwd,
    script: env.pm_exec_path,
    args: env.args || [],
    interpreter: env.exec_interpreter || process.execPath,
    ...(env.node_args ? { node_args: env.node_args } : {}),
    instances: 1,
    exec_mode: "fork",
    env: { ...env.env, NODE_ENV: "production" },
    log_date_format: "YYYY-MM-DD HH:mm:ss",
    max_memory_restart: "500M",
    restart_delay: 3000,
  };
}

async function writeConfig(file, config) {
  await writeFile(file, `module.exports = ${JSON.stringify({ apps: [config] }, null, 2)};\n`, { mode: 0o600 });
}

/** Injectable process/SQLite/health operations let rollback be tested without deploying. */
export async function performUpdate({ root, targetRevision, jobId }, dependencies = {}) {
  const environment = { ...(dependencies.env || process.env), GIT_TERMINAL_PROMPT: "0" };
  const platform = dependencies.platform || process.platform;
  const run = dependencies.run || runCommand;
  const backup = dependencies.backup || sqliteBackup;
  const checkHealth = dependencies.health || health;
  const link = dependencies.link || symlink;
  const logError = dependencies.logError || console.error;
  const prune = dependencies.prune || pruneUpdateArtifacts;
  const notify = dependencies.notify || notifyUpdateResult;
  const notifyDatabase = () => liveDatabase || databaseFile(environment.DATABASE_URL, root);
  // 进度、失败原因会显示在后台，结果会推送到告警渠道：都按网站语言（lib/script-i18n.mjs）
  const t = scriptText(dependencies.locale !== undefined ? dependencies.locale : readSiteLocale(environment.DATABASE_URL, root));
  const branch = environment.SITE_UPDATE_BRANCH || "master";
  if (!SHA.test(targetRevision) || !JOB.test(jobId)) throw new Error(t("error.badJob"));
  root = await realpath(root);
  const updates = path.join(root, ".updates");
  const lock = path.join(updates, "update.lock");
  const statusFile = path.join(updates, "status.json");
  const initial = JSON.parse(await readFile(statusFile, "utf8"));
  if (initial.jobId !== jobId || initial.state !== "running" || !(await stat(lock)).isDirectory()) {
    throw new Error(t("error.badLock"));
  }
  let current = { ...initial, jobId, targetRevision, pid: process.pid };
  let phase = "preflight";
  const progress = async (next, message, state = "running") => {
    phase = next;
    current = { ...current, phase, message, state, updatedAt: new Date().toISOString() };
    await atomicJSON(statusFile, current);
  };
  const command = (binary, args, options = {}) => run(binary, args, { cwd: root, env: environment, ...options });
  let previous;
  let liveDatabase;
  let liveBackup;
  let currentRevision;
  let port;
  let activationStarted = false;
  let migrationsStarted = false;
  let rollbackFailed = false;
  const activeConfig = path.join(updates, "active.config.cjs");
  const previousConfig = path.join(updates, `previous-${jobId}.config.cjs`);
  const appName = environment.SITE_PM2_APP_NAME || "教程网";
  try {
    await progress("preflight", t("progress.preflight"));
    assertBranch(branch);
    if (platform !== "linux" || environment.NODE_ENV !== "production" || environment.SITE_AUTO_UPDATE === "false") {
      throw new Error(t("error.notEnabled"));
    }
    const origin = await command("git", ["remote", "get-url", "origin"], { capture: true, timeout: 15_000 });
    if (!isExpectedOrigin(origin)) throw new Error(t("error.badOrigin"));
    if (await command("git", ["status", "--porcelain", "--untracked-files=all"], { capture: true, timeout: 15_000 })) {
      throw new Error(t("error.dirty"));
    }
    const apps = JSON.parse(await command("pm2", ["jlist"], { capture: true, timeout: 15_000 }));
    const matches = apps.filter((app) => app.name === appName);
    if (matches.length !== 1 || !["fork", "fork_mode"].includes(matches[0].pm2_env?.exec_mode) || matches[0].pm2_env.status !== "online") {
      throw new Error(t("error.noProcess"));
    }
    const app = matches[0];
    const runningRoot = await realpath(app.pm2_env.pm_cwd);
    if (runningRoot !== root && !within(path.join(root, ".updates", "releases"), runningRoot)) {
      throw new Error(t("error.foreignCwd"));
    }
    const expectedScript = await realpath(path.join(runningRoot, "node_modules", "next", "dist", "bin", "next"));
    if (await realpath(app.pm2_env.pm_exec_path) !== expectedScript) throw new Error(t("error.foreignScript"));
    previous = processConfig(app);
    currentRevision = environment.SITE_CURRENT_REVISION || app.pm2_env.env?.SITE_DEPLOYED_REVISION || await command("git", ["rev-parse", "HEAD"], { cwd: runningRoot, capture: true, timeout: 15_000 });
    if (!SHA.test(currentRevision)) throw new Error(t("error.unknownRevision"));
    const currentHead = await command("git", ["rev-parse", "HEAD"], { cwd: runningRoot, capture: true, timeout: 15_000 });
    if (currentHead !== currentRevision) throw new Error(t("error.revisionMismatch"));
    liveDatabase = databaseFile(environment.DATABASE_URL || previous.env.DATABASE_URL, runningRoot);
    if (!(await stat(liveDatabase)).isFile()) throw new Error(t("error.badDatabase"));
    liveDatabase = await realpath(liveDatabase);
    if (within(path.join(updates, "releases"), liveDatabase)) throw new Error(t("error.databaseInRelease"));
    port = Number(environment.PORT || previous.env.PORT || 3000);
    if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error(t("error.badPort"));
    const releases = path.join(updates, "releases");
    await mkdir(releases, { recursive: true, mode: 0o700 });
    const release = path.join(releases, jobId);
    const buildDatabase = path.join(release, ".update-build.db");
    liveBackup = path.join(updates, `database-${jobId}.db`);
    await progress("fetch", t("progress.fetch"));
    await command("git", ["clone", "--shared", "--no-checkout", "--", root, release]);
    await command("git", ["remote", "set-url", "origin", origin], { cwd: release });
    await command("git", ["fetch", "--no-tags", "origin", branch], { cwd: release, timeout: 120_000 });
    const fetched = await command("git", ["rev-parse", "FETCH_HEAD"], { cwd: release, capture: true });
    if (fetched !== targetRevision) throw new Error(t("error.revisionChanged"));
    try { await command("git", ["merge-base", "--is-ancestor", currentRevision, targetRevision], { cwd: release }); }
    catch { throw new Error(t("error.notAncestor")); }
    if (targetRevision === currentRevision) throw new Error(t("error.alreadyLatest"));
    if (environment.SITE_UPDATE_REQUIRE_SIGNED === "true") {
      // 需要服务器上配置好可信的 GPG 公钥或 SSH allowedSignersFile。
      try { await command("git", ["verify-commit", targetRevision], { cwd: release, timeout: 30_000 }); }
      catch { throw new Error(t("error.unsigned")); }
    }
    await command("git", ["checkout", "--detach", targetRevision], { cwd: release });
    for (const filename of [".env", ".env.local", ".env.production", ".env.production.local"]) {
      if (await exists(path.join(root, filename))) await copyFile(path.join(root, filename), path.join(release, filename));
    }
    const uploads = path.join(root, "public", "uploads");
    await mkdir(uploads, { recursive: true });
    const releaseUploads = path.join(release, "public", "uploads");
    if (await exists(releaseUploads)) throw new Error(t("error.uploadsInRelease"));
    await link(uploads, releaseUploads, "dir");
    const buildEnvironment = { ...environment, NODE_ENV: "production", DATABASE_URL: `file:${buildDatabase}`, SITE_DEPLOYED_REVISION: targetRevision, SITE_UPDATE_ROOT: root };
    await progress("install", t("progress.install"));
    await command("npm", ["ci", "--include=dev"], { cwd: release, env: buildEnvironment });
    const prisma = path.join(release, "node_modules", "prisma", "build", "index.js");
    await command(process.execPath, [prisma, "generate"], { cwd: release, env: buildEnvironment });
    await progress("build", t("progress.build"));
    await backup(liveDatabase, buildDatabase, runningRoot);
    await command(process.execPath, [prisma, "migrate", "deploy"], { cwd: release, env: buildEnvironment });
    await command("npm", ["run", "build"], { cwd: release, env: buildEnvironment });
    // Recheck before stopping: an operator may have edited the source during the build.
    if (await command("git", ["status", "--porcelain", "--untracked-files=all"], { capture: true })) {
      throw new Error(t("error.changedDuringBuild"));
    }
    await writeConfig(previousConfig, previous);
    await progress("activate", t("progress.activate"));
    activationStarted = true;
    await command("pm2", ["stop", appName], { timeout: 30_000 });
    await backup(liveDatabase, liveBackup, runningRoot);
    const productionEnvironment = {
      ...previous.env, ...environment, NODE_ENV: "production", DATABASE_URL: `file:${liveDatabase}`,
      SITE_UPDATE_ROOT: root, SITE_DEPLOYED_REVISION: targetRevision, SITE_AUTO_UPDATE: "true", PORT: port,
    };
    delete productionEnvironment.SITE_CURRENT_REVISION;
    migrationsStarted = true;
    await command(process.execPath, [prisma, "migrate", "deploy"], { cwd: release, env: productionEnvironment });
    await writeConfig(activeConfig, {
      ...previous, cwd: release, script: path.join(release, "node_modules", "next", "dist", "bin", "next"),
      env: productionEnvironment,
    });
    // PM2 reload can retain the old script/cwd. Recreate only this named process.
    await command("pm2", ["delete", appName], { timeout: 30_000 });
    await command("pm2", ["start", activeConfig, "--only", appName, "--update-env"], { timeout: 30_000 });
    await progress("health", t("progress.health"));
    await checkHealth(targetRevision, port);
    const onlineApps = JSON.parse(await command("pm2", ["jlist"], { capture: true, timeout: 15_000 }));
    if (!onlineApps.some((entry) => entry.name === appName && entry.pm2_env.status === "online" && entry.pm2_env.pm_cwd === release)) {
      throw new Error(t("error.notOnline"));
    }
    await command("pm2", ["save"], { timeout: 30_000 });
    for (const suffix of ["", "-wal", "-shm"]) await rm(`${buildDatabase}${suffix}`, { force: true });
    try {
      await prune(updates, { protect: [release, previous.cwd, liveBackup, previousConfig] });
    } catch (pruneError) { logError(`[site-update:${jobId}] prune`, pruneError); }
    await progress("complete", t("progress.complete"), "success");
    await notify(notifyDatabase(), root, {
      event: "site-update.success",
      title: t("updated"),
      lines: [t("newRevision", { rev: targetRevision.slice(0, 7) }), t("oldRevision", { rev: currentRevision.slice(0, 7) })],
    });
    return { success: true, release };
  } catch (error) {
    logError(`[site-update:${jobId}] ${phase}`, error);
    const failedPhase = phase;
    if (activationStarted && previous) {
      try { await progress("rollback", t("progress.rollback")); }
      catch (statusError) { logError(`[site-update:${jobId}] rollback status`, statusError); }
      try {
        try { await command("pm2", ["delete", appName], { timeout: 30_000 }); }
        catch {
          const apps = JSON.parse(await command("pm2", ["jlist"], { capture: true, timeout: 15_000 }));
          if (apps.some((entry) => entry.name === appName)) throw new Error(t("error.cantStop"));
        }
        if (migrationsStarted) {
          if (!(await exists(liveBackup))) throw new Error(t("error.noBackup"));
          await rm(`${liveDatabase}-wal`, { force: true });
          await rm(`${liveDatabase}-shm`, { force: true });
          await copyFile(liveBackup, liveDatabase);
        }
        await writeConfig(activeConfig, previous);
        await command("pm2", ["start", activeConfig, "--only", appName, "--update-env"], { timeout: 30_000 });
        await checkHealth(currentRevision, port);
        const restoredApps = JSON.parse(await command("pm2", ["jlist"], { capture: true, timeout: 15_000 }));
        if (!restoredApps.some((entry) => entry.name === appName && entry.pm2_env.status === "online" && entry.pm2_env.pm_cwd === previous.cwd)) {
          throw new Error(t("error.notRestored"));
        }
        await command("pm2", ["save"], { timeout: 30_000 });
      } catch (rollbackError) {
        rollbackFailed = true;
        logError(`[site-update:${jobId}] rollback`, rollbackError);
      }
    }
    const preflightMessage = error instanceof Error ? error.message : t("error.checkFailed");
    const message = rollbackFailed
      ? t("failed.unrecovered")
      : activationStarted
        ? t("failed.restored")
        : ["preflight", "fetch"].includes(failedPhase)
          ? preflightMessage.startsWith("git ") || preflightMessage.startsWith("pm2 ") ? t("failed.check") : preflightMessage
          : t("failed.build");
    await progress("failed", message, "error");
    await notify(notifyDatabase(), root, {
      event: "site-update.failed",
      title: rollbackFailed ? t("updateFailedUnrecovered") : t("updateFailed"),
      lines: [message, t("targetRevision", { rev: targetRevision.slice(0, 7) }), t("failedPhase", { phase: t(`phase.${failedPhase}`) })],
    });
    return { success: false, rollbackFailed };
  } finally {
    // Do not remove a newer task's lock if the status was changed by an operator.
    try {
      const status = JSON.parse(await readFile(statusFile, "utf8"));
      if (status.jobId === jobId && within(updates, path.resolve(lock))) await rm(lock, { recursive: true, force: true });
    } catch (error) { logError(`[site-update:${jobId}] lock cleanup`, error); }
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [root, targetRevision, jobId] = process.argv.slice(2);
  performUpdate({ root, targetRevision, jobId }).then((result) => {
    if (!result.success) process.exitCode = 1;
  }).catch((error) => {
    console.error("[site-update] Worker initialization failed", error);
    process.exitCode = 1;
  });
}
