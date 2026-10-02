#!/usr/bin/env node
/** Detached Linux/PM2 updater. Run only through the authenticated update API. */
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { access, copyFile, mkdir, readFile, realpath, rename, rm, stat, symlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const REPOSITORY = "https://github.com/vow132/tutorial-site.git";
const SHA = /^[a-f0-9]{40}$/;
const JOB = /^[a-zA-Z0-9][a-zA-Z0-9_-]{7,79}$/;

export function isExpectedOrigin(origin) {
  return /^(?:https:\/\/github\.com\/|git@github\.com:|ssh:\/\/git@github\.com\/)vow132\/tutorial-site(?:\.git)?\/?$/.test(origin.trim());
}

export function databaseFile(configured, cwd) {
  const url = (configured || "file:./prisma/dev.db").trim();
  if (!url.startsWith("file:")) throw new Error("自动更新仅支持本地 SQLite 数据库。");
  const file = url.slice(5).split("?")[0];
  if (!file || file === ":memory:") throw new Error("自动更新需要持久化 SQLite 数据库。");
  return path.resolve(cwd, file);
}

export function assertBranch(branch) {
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._/-]*$/.test(branch) || branch.includes("..") || branch.endsWith("/") || branch.includes("//") || branch.endsWith(".lock")) {
    throw new Error("更新分支配置无效。");
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

async function sqliteBackup(source, destination, moduleRoot) {
  const require = createRequire(path.join(moduleRoot, "package.json"));
  const Database = require("better-sqlite3");
  const db = new Database(source, { readonly: true, fileMustExist: true, timeout: 10_000 });
  try { await db.backup(destination); } finally { db.close(); }
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
  throw new Error("新版本健康检查失败。");
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
  const branch = environment.SITE_UPDATE_BRANCH || "master";
  if (!SHA.test(targetRevision) || !JOB.test(jobId)) throw new Error("更新任务参数无效。");
  root = await realpath(root);
  const updates = path.join(root, ".updates");
  const lock = path.join(updates, "update.lock");
  const statusFile = path.join(updates, "status.json");
  const initial = JSON.parse(await readFile(statusFile, "utf8"));
  if (initial.jobId !== jobId || initial.state !== "running" || !(await stat(lock)).isDirectory()) {
    throw new Error("更新任务锁无效。");
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
    await progress("preflight", "正在检查部署环境…");
    assertBranch(branch);
    if (platform !== "linux" || environment.NODE_ENV !== "production" || environment.SITE_AUTO_UPDATE === "false") {
      throw new Error("自动更新需要启用更新功能的 Linux + PM2 生产部署。");
    }
    const origin = await command("git", ["remote", "get-url", "origin"], { capture: true, timeout: 15_000 });
    if (!isExpectedOrigin(origin)) throw new Error("本地 Git 仓库来源与教程网仓库不一致。");
    if (await command("git", ["status", "--porcelain", "--untracked-files=all"], { capture: true, timeout: 15_000 })) {
      throw new Error("服务器存在未提交的本地修改，请先处理后再更新。");
    }
    const apps = JSON.parse(await command("pm2", ["jlist"], { capture: true, timeout: 15_000 }));
    const matches = apps.filter((app) => app.name === appName);
    if (matches.length !== 1 || !["fork", "fork_mode"].includes(matches[0].pm2_env?.exec_mode) || matches[0].pm2_env.status !== "online") {
      throw new Error("自动更新需要一个正在运行的 PM2 fork 模式站点进程。");
    }
    const app = matches[0];
    const runningRoot = await realpath(app.pm2_env.pm_cwd);
    if (runningRoot !== root && !within(path.join(root, ".updates", "releases"), runningRoot)) {
      throw new Error("PM2 进程目录不属于当前站点。");
    }
    const expectedScript = await realpath(path.join(runningRoot, "node_modules", "next", "dist", "bin", "next"));
    if (await realpath(app.pm2_env.pm_exec_path) !== expectedScript) throw new Error("PM2 启动入口不是当前站点的 Next.js。");
    previous = processConfig(app);
    currentRevision = environment.SITE_CURRENT_REVISION || app.pm2_env.env?.SITE_DEPLOYED_REVISION || await command("git", ["rev-parse", "HEAD"], { cwd: runningRoot, capture: true, timeout: 15_000 });
    if (!SHA.test(currentRevision)) throw new Error("无法确认当前部署版本。");
    const currentHead = await command("git", ["rev-parse", "HEAD"], { cwd: runningRoot, capture: true, timeout: 15_000 });
    if (currentHead !== currentRevision) throw new Error("当前运行版本与 Git 工作目录不一致，请先重新部署。");
    liveDatabase = databaseFile(environment.DATABASE_URL || previous.env.DATABASE_URL, runningRoot);
    if (!(await stat(liveDatabase)).isFile()) throw new Error("站点数据库文件无效。");
    liveDatabase = await realpath(liveDatabase);
    if (within(path.join(updates, "releases"), liveDatabase)) throw new Error("数据库必须位于共享持久化目录中。");
    port = Number(environment.PORT || previous.env.PORT || 3000);
    if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error("站点端口配置无效。");
    const releases = path.join(updates, "releases");
    await mkdir(releases, { recursive: true, mode: 0o700 });
    const release = path.join(releases, jobId);
    const buildDatabase = path.join(release, ".update-build.db");
    liveBackup = path.join(updates, `database-${jobId}.db`);
    await progress("fetch", "正在获取仓库更新…");
    await command("git", ["clone", "--shared", "--no-checkout", "--", root, release]);
    await command("git", ["remote", "set-url", "origin", origin], { cwd: release });
    await command("git", ["fetch", "--no-tags", "origin", branch], { cwd: release, timeout: 120_000 });
    const fetched = await command("git", ["rev-parse", "FETCH_HEAD"], { cwd: release, capture: true });
    if (fetched !== targetRevision) throw new Error("仓库版本已变化，请重新检查更新。");
    try { await command("git", ["merge-base", "--is-ancestor", currentRevision, targetRevision], { cwd: release }); }
    catch { throw new Error("仓库更新与当前版本历史不兼容，已停止更新。"); }
    if (targetRevision === currentRevision) throw new Error("当前已经是最新版本。");
    await command("git", ["checkout", "--detach", targetRevision], { cwd: release });
    for (const filename of [".env", ".env.local", ".env.production", ".env.production.local"]) {
      if (await exists(path.join(root, filename))) await copyFile(path.join(root, filename), path.join(release, filename));
    }
    const uploads = path.join(root, "public", "uploads");
    await mkdir(uploads, { recursive: true });
    const releaseUploads = path.join(release, "public", "uploads");
    if (await exists(releaseUploads)) throw new Error("新版本包含上传目录，无法安全共享现有文件。");
    await link(uploads, releaseUploads, "dir");
    const buildEnvironment = { ...environment, NODE_ENV: "production", DATABASE_URL: `file:${buildDatabase}`, SITE_DEPLOYED_REVISION: targetRevision, SITE_UPDATE_ROOT: root };
    await progress("install", "正在安装新版本依赖…");
    await command("npm", ["ci", "--include=dev"], { cwd: release, env: buildEnvironment });
    const prisma = path.join(release, "node_modules", "prisma", "build", "index.js");
    await command(process.execPath, [prisma, "generate"], { cwd: release, env: buildEnvironment });
    await progress("build", "正在使用数据库副本构建新版本，站点继续运行…");
    await backup(liveDatabase, buildDatabase, runningRoot);
    await command(process.execPath, [prisma, "migrate", "deploy"], { cwd: release, env: buildEnvironment });
    await command("npm", ["run", "build"], { cwd: release, env: buildEnvironment });
    // Recheck before stopping: an operator may have edited the source during the build.
    if (await command("git", ["status", "--porcelain", "--untracked-files=all"], { capture: true })) {
      throw new Error("构建期间检测到服务器本地修改，更新已取消。");
    }
    await writeConfig(previousConfig, previous);
    await progress("activate", "构建成功，正在备份数据库并切换版本…");
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
    await progress("health", "正在验证新版本运行状态…");
    await checkHealth(targetRevision, port);
    const onlineApps = JSON.parse(await command("pm2", ["jlist"], { capture: true, timeout: 15_000 }));
    if (!onlineApps.some((entry) => entry.name === appName && entry.pm2_env.status === "online" && entry.pm2_env.pm_cwd === release)) {
      throw new Error("新版本 PM2 进程未正常运行。");
    }
    await command("pm2", ["save"], { timeout: 30_000 });
    for (const suffix of ["", "-wal", "-shm"]) await rm(`${buildDatabase}${suffix}`, { force: true });
    await progress("complete", "更新成功，站点已运行最新版本。", "success");
    return { success: true, release };
  } catch (error) {
    logError(`[site-update:${jobId}] ${phase}`, error);
    const failedPhase = phase;
    if (activationStarted && previous) {
      try { await progress("rollback", "新版本切换失败，正在恢复原版本…"); }
      catch (statusError) { logError(`[site-update:${jobId}] rollback status`, statusError); }
      try {
        try { await command("pm2", ["delete", appName], { timeout: 30_000 }); }
        catch {
          const apps = JSON.parse(await command("pm2", ["jlist"], { capture: true, timeout: 15_000 }));
          if (apps.some((entry) => entry.name === appName)) throw new Error("无法停止进程，不能安全恢复数据库。");
        }
        if (migrationsStarted) {
          if (!(await exists(liveBackup))) throw new Error("回滚数据库备份缺失。");
          await rm(`${liveDatabase}-wal`, { force: true });
          await rm(`${liveDatabase}-shm`, { force: true });
          await copyFile(liveBackup, liveDatabase);
        }
        await writeConfig(activeConfig, previous);
        await command("pm2", ["start", activeConfig, "--only", appName, "--update-env"], { timeout: 30_000 });
        await checkHealth(currentRevision, port);
        const restoredApps = JSON.parse(await command("pm2", ["jlist"], { capture: true, timeout: 15_000 }));
        if (!restoredApps.some((entry) => entry.name === appName && entry.pm2_env.status === "online" && entry.pm2_env.pm_cwd === previous.cwd)) {
          throw new Error("原版本 PM2 进程未正常恢复。");
        }
        await command("pm2", ["save"], { timeout: 30_000 });
      } catch (rollbackError) {
        rollbackFailed = true;
        logError(`[site-update:${jobId}] rollback`, rollbackError);
      }
    }
    const preflightMessage = error instanceof Error ? error.message : "部署检查失败。";
    const message = rollbackFailed
      ? "更新失败且自动恢复未完成，请检查服务器 .updates/worker.log；数据库备份已保留。"
      : activationStarted
        ? "更新失败，已恢复原版本。详细原因见服务器 .updates/worker.log。"
        : ["preflight", "fetch"].includes(failedPhase)
          ? preflightMessage.startsWith("git ") || preflightMessage.startsWith("pm2 ") ? "部署检查失败，请检查服务器 .updates/worker.log。" : preflightMessage
          : "新版本构建失败，原站点继续运行。详细原因见服务器 .updates/worker.log。";
    await progress("failed", message, "error");
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
