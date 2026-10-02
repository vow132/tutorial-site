import { execFile, spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdir, open, readFile, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { SITE_REPOSITORY, type SiteUpdateStatus, type UpdateJob } from "./site-update-types";
import { getDatabaseUrl } from "./database-url";

const exec = promisify(execFile);
const REVISION = /^[a-f0-9]{40}$/;
const CACHE_MS = 5 * 60_000;
let cached: { key: string; expires: number; value: SiteUpdateStatus } | undefined;
let pending: { key: string; promise: Promise<SiteUpdateStatus> } | undefined;
let starting: Promise<SiteUpdateStatus> | undefined;

export function runningRevision(): string | null {
  // This value is captured by webpack, so a later git pull cannot make an old
  // running build claim that it has already deployed the new source revision.
  const revision = process.env.SITE_BUILD_REVISION;
  return revision && REVISION.test(revision) ? revision : null;
}

export function updateRoot(): string {
  return path.resolve(process.env.SITE_UPDATE_ROOT || process.cwd());
}

function environmentRestriction(): string | null {
  if (process.env.NODE_ENV !== "production" || process.platform !== "linux") {
    return "一键更新需要 Linux 服务器上的 PM2 生产部署；本地开发环境仅检测更新。";
  }
  if (process.env.SITE_AUTO_UPDATE === "false") return "服务器已关闭一键更新。";
  return null;
}

export async function readUpdateJob(): Promise<UpdateJob | undefined> {
  try {
    const value = JSON.parse(await readFile(path.join(updateRoot(), ".updates/status.json"), "utf8"));
    if (
      typeof value.jobId !== "string" || !["running", "success", "error"].includes(value.state) ||
      !REVISION.test(value.targetRevision) || typeof value.message !== "string" ||
      !Number.isFinite(Date.parse(value.startedAt)) || !Number.isFinite(Date.parse(value.updatedAt))
    ) return undefined;
    return value as UpdateJob;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw new Error("无法读取更新状态，请检查服务器 .updates 目录的权限。", { cause: error });
  }
}

export function jobIsAlive(job: UpdateJob): boolean {
  if (job.state !== "running") return false;
  if (!job.pid) return Date.now() - Date.parse(job.startedAt) < 30_000;
  try {
    process.kill(job.pid, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === "EPERM";
  }
}

async function github(resource: string): Promise<unknown> {
  const headers: Record<string, string> = {
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2026-03-10",
    "User-Agent": "tutorial-site-updater",
  };
  if (process.env.GITHUB_TOKEN) headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  const response = await fetch(`https://api.github.com/repos/${SITE_REPOSITORY}/${resource}`, {
    headers, cache: "no-store", signal: AbortSignal.timeout(12_000), redirect: "error",
  });
  if (response.status === 403 || response.status === 429) {
    throw new Error("GitHub 请求受限，请稍后重试，或在服务器配置 GITHUB_TOKEN。服务器时间与令牌权限也会影响检测。" );
  }
  if (response.status === 404) throw new Error("GitHub 找不到当前分支或版本，请检查 SITE_UPDATE_BRANCH 和仓库访问权限。" );
  if (!response.ok) throw new Error("GitHub 暂时无法检测更新，请稍后重试。" );
  return response.json();
}

export function compareState(current: string, latest: string, comparison?: string): SiteUpdateStatus["state"] {
  if (current === latest || comparison === "identical" || comparison === "behind") return "current";
  if (comparison === "ahead") return "available";
  return "unavailable";
}

async function checkRepository(): Promise<SiteUpdateStatus> {
  const currentRevision = runningRevision();
  const checkedAt = new Date().toISOString();
  const restriction = environmentRestriction();
  const base = { currentRevision, latestRevision: null, checkedAt, canUpdate: !restriction };
  if (!currentRevision) return { ...base, state: "unavailable", canUpdate: false, message: "无法识别运行版本，请从 Git 仓库构建并部署网站。" };
  const branch = process.env.SITE_UPDATE_BRANCH || "master";
  try {
    const commit = await github(`commits/${encodeURIComponent(branch)}`) as { sha?: string };
    if (!commit.sha || !REVISION.test(commit.sha)) throw new Error("GitHub 返回的版本信息无效，请稍后重试。" );
    const comparison = commit.sha === currentRevision ? undefined :
      await github(`compare/${currentRevision}...${commit.sha}`) as { status?: string };
    const state = compareState(currentRevision, commit.sha, comparison?.status);
    const message = state === "available"
      ? `发现新版本 ${commit.sha.slice(0, 7)}。${restriction || "点击黄色圆点自动更新。"}`
      : state === "current" ? "当前已是最新版本。"
      : "运行版本与仓库分支已分叉，无法自动更新，请先由维护者处理版本差异。";
    return { ...base, latestRevision: commit.sha, state, canUpdate: !restriction && state === "available", message };
  } catch (error) {
    return { ...base, state: "error", canUpdate: false, message: error instanceof Error ? error.message : "检测失败，请稍后重试。" };
  }
}

export async function getSiteUpdateStatus(): Promise<SiteUpdateStatus> {
  let job = await readUpdateJob();
  const currentRevision = runningRevision();
  if (job?.state === "running" && jobIsAlive(job)) {
    return {
      state: "updating", message: job.message,
      currentRevision, latestRevision: job.targetRevision, checkedAt: job.updatedAt,
      canUpdate: false, job,
    };
  }
  // A worker can stop after switching the service but before recording success.
  // The exact running build is authoritative, including after manual recovery.
  if (job && job.state !== "success" && currentRevision === job.targetRevision) {
    job = { ...job, state: "success", phase: "complete", message: "当前运行版本已更新完成。" };
  }
  if (job?.state === "running") {
    return {
      state: "error",
      message: "更新进程已中断，请查看服务器 .updates/worker.log 后重试。",
      currentRevision, latestRevision: job.targetRevision, checkedAt: job.updatedAt,
      canUpdate: !environmentRestriction(), job,
    };
  }
  const key = `${currentRevision}:${process.env.SITE_UPDATE_BRANCH || "master"}`;
  let value: SiteUpdateStatus;
  if (cached?.key === key && cached.expires > Date.now()) value = cached.value;
  else {
    if (pending?.key !== key) {
      const promise = checkRepository().then((result) => {
        cached = { key, value: result, expires: Date.now() + (result.state === "error" ? 60_000 : CACHE_MS) };
        return result;
      }).finally(() => { if (pending?.key === key) pending = undefined; });
      pending = { key, promise };
    }
    value = await pending.promise;
  }
  if (job?.state === "error" && value.state !== "current") {
    return { ...value, state: "error", message: job.message, canUpdate: value.state === "available" && value.canUpdate, job };
  }
  return { ...value, ...(job ? { job } : {}) };
}

export function startSiteUpdate(): Promise<SiteUpdateStatus> {
  starting ??= launchUpdate().finally(() => { starting = undefined; });
  return starting;
}

async function launchUpdate(): Promise<SiteUpdateStatus> {
  const restriction = environmentRestriction();
  if (restriction) throw new Error(restriction);
  const root = updateRoot();
  const directory = path.join(root, ".updates");
  const lock = path.join(directory, "update.lock");
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const oldJob = await readUpdateJob();
  if (oldJob?.state === "running" && jobIsAlive(oldJob)) return getSiteUpdateStatus();
  try {
    const lockInfo = await stat(lock);
    if (Date.now() - lockInfo.mtimeMs > 60_000 && (!oldJob || !jobIsAlive(oldJob))) {
      await rm(lock, { recursive: true, force: true });
    }
  } catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
  try { await mkdir(lock, { mode: 0o700 }); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === "EEXIST") throw new Error("另一个更新请求正在准备，请稍后查看进度。" );
    throw new Error("无法创建更新任务，请检查服务器目录权限。", { cause: error });
  }
  let launched = false;
  let job: UpdateJob | undefined;
  try {
    // Always refresh on an explicit deployment request; a cached version is
    // useful for display but must not authorize deploying an outdated target.
    const status = await checkRepository();
    if (status.state !== "available" || !status.canUpdate || !status.latestRevision) throw new Error(status.message);
    const { stdout: remote } = await exec("git", ["remote", "get-url", "origin"], { cwd: root, timeout: 10_000 });
    if (!/^(?:https:\/\/github\.com\/|git@github\.com:|ssh:\/\/git@github\.com\/)vow132\/tutorial-site(?:\.git)?\s*$/i.test(remote)) {
      throw new Error("服务器 origin 不是 vow132/tutorial-site，已停止更新。" );
    }
    const now = new Date().toISOString();
    job = { jobId: randomUUID(), state: "running", phase: "preparing", message: "正在准备更新，新版本构建完成后将自动切换。", targetRevision: status.latestRevision, startedAt: now, updatedAt: now };
    await writeFile(path.join(directory, "status.json"), JSON.stringify(job), { mode: 0o600 });
    const log = await open(path.join(directory, "worker.log"), "a", 0o600);
    try {
      const child = spawn(process.execPath, [path.join(process.cwd(), "scripts/site-update.mjs"), root, job.targetRevision, job.jobId], {
        cwd: root, detached: true, windowsHide: true, stdio: ["ignore", log.fd, log.fd],
        env: { ...process.env, SITE_CURRENT_REVISION: status.currentRevision!, DATABASE_URL: getDatabaseUrl() },
      });
      await new Promise<void>((resolve, reject) => { child.once("spawn", resolve); child.once("error", reject); });
      child.unref();
      launched = true;
    } finally { await log.close(); }
    return { ...status, state: "updating", canUpdate: false, message: job.message, job };
  } catch (error) {
    if (job) await writeFile(path.join(directory, "status.json"), JSON.stringify({ ...job, state: "error", message: "无法启动更新，请检查服务器配置和 .updates/worker.log。", updatedAt: new Date().toISOString() }), { mode: 0o600 });
    throw error;
  } finally {
    if (!launched) await rm(lock, { recursive: true, force: true });
  }
}
