#!/usr/bin/env node
/**
 * Docker 容器的启动脚本（Dockerfile 的 CMD）：
 * 1. 以 root 修正挂载目录（数据库、上传、备份）的属主，之后的命令都以 node 用户运行；
 * 2. 执行数据库迁移（scripts/migrate.mjs，和 prisma migrate deploy 等价，镜像里没有 Prisma 命令行）；
 *    数据库是新建的（第一次启动）才写入种子数据（管理员、示例分类和教程）；
 * 3. 启动 Next 的 standalone 服务（server.js），转发停止信号；
 * 4. 服务起来后在后台请求一遍主要页面，第一个访客不用等页面生成。
 *
 * 镜像里的页面是构建时用空库预渲染的（构建时拿不到真实数据库）。如果直接用，sitemap 这类缓存 1 小时的页面
 * 在启动后的 1 小时里都是空的。所以每次启动前删掉这些预渲染结果和上次运行留下的页面 / 数据缓存，
 * 让 Next 在第一次访问时按真实数据重新生成（重启后进程内存里的缓存失效记录也没了，旧缓存同样不能用）。
 */
import { spawn, spawnSync } from "node:child_process";
import { existsSync, chownSync, readdirSync, readFileSync, rmSync, statSync } from "node:fs";
import path from "node:path";
import { authSecretFrom } from "../lib/auth-secret.mjs";

if (!authSecretFrom({ ...process.env, NODE_ENV: "production" })) {
  console.error(
    "❌ AUTH_SECRET 没有设置，或者还是 .env.example 里的占位值（等于把后台登录的签名密钥公开）。\n" +
      "   请在 .env 里改成 openssl rand -base64 48 生成的随机字符串，然后执行 docker compose up -d\n" +
      "❌ AUTH_SECRET is not set, or still the placeholder from .env.example (which would make the admin sign-in key public).\n" +
      "   Set it in .env to a random string from openssl rand -base64 48, then run docker compose up -d",
  );
  process.exit(1);
}

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const port = process.env.PORT || "3000";
const databaseUrl = process.env.DATABASE_URL || "file:/app/data/tutorial.db";
const dbFile = path.resolve(root, databaseUrl.replace(/^file:/, "").split("?")[0]);
const writable = [path.dirname(dbFile), path.join(root, "public", "uploads"), process.env.BACKUP_DIR || path.join(root, "backups")];

const asRoot = process.getuid?.() === 0;
const NODE_UID = 1000;

function chownTree(dir) {
  if (!existsSync(dir)) return;
  chownSync(dir, NODE_UID, NODE_UID);
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name);
    const info = statSync(full);
    if (info.uid !== NODE_UID) chownSync(full, NODE_UID, NODE_UID);
    if (info.isDirectory()) chownTree(full);
  }
}

/** 以 node 用户执行（容器以 root 启动时用 setpriv 降权）。 */
function command(args) {
  return asRoot ? ["setpriv", ["--reuid=node", "--regid=node", "--init-groups", "--", ...args]] : [args[0], args.slice(1)];
}

function run(args) {
  const [cmd, rest] = command(args);
  const result = spawnSync(cmd, rest, { cwd: root, stdio: "inherit", env: process.env });
  if (result.status !== 0) {
    // 这里还是 root、不打开数据库（以 root 打开会留下 root 所有的 -wal/-shm 文件），不知道网站语言，中英文都写
    console.error(`❌ ${args.join(" ")} 失败（退出码 ${result.status}）/ failed (exit code ${result.status})`);
    process.exit(result.status ?? 1);
  }
}

/** 删掉构建时预渲染的 ISR 页面（按 prerender-manifest.json）和运行时的页面 / 数据缓存。 */
function dropBuildTimePages() {
  const next = path.join(root, ".next");
  let routes = {};
  try {
    routes = JSON.parse(readFileSync(path.join(next, "prerender-manifest.json"), "utf8")).routes ?? {};
  } catch {
    return;
  }
  const appDir = path.join(next, "server", "app");
  let removed = 0;
  for (const [route, info] of Object.entries(routes)) {
    // revalidate 为 false 的是纯静态页面（例如 robots.txt 只取决于构建时的 SITE_URL），不用删
    if (info.initialRevalidateSeconds === false || route.startsWith("/_global-error")) continue;
    const base = path.join(appDir, route === "/" ? "index" : route.slice(1));
    const dir = path.dirname(base);
    if (!dir.startsWith(appDir) || !existsSync(dir)) continue;
    const prefix = `${path.basename(base)}.`;
    for (const name of readdirSync(dir)) {
      if (name.startsWith(prefix)) {
        rmSync(path.join(dir, name), { recursive: true, force: true });
        removed++;
      }
    }
  }
  rmSync(path.join(next, "server", "route-cache"), { recursive: true, force: true });
  rmSync(path.join(next, "cache", "fetch-cache"), { recursive: true, force: true });
  if (removed) {
    console.log("ℹ️ 已清除构建时用空库生成的页面，首次访问时按真实数据重新生成 / Removed pages pre-rendered from the empty build database; they're regenerated from real data on first visit");
  }
}

if (asRoot) for (const dir of writable) chownTree(dir);
dropBuildTimePages();

const firstRun = !existsSync(dbFile);
run(["node", "scripts/migrate.mjs"]);
if (firstRun) {
  console.log("ℹ️ 第一次启动：写入种子数据（管理员账号、示例分类和教程） / First start: writing seed data (admin account, sample categories and tutorials)");
  // prisma/seed.ts 构建镜像时打包成了 scripts/seed.mjs（scripts/docker-runtime.mjs）
  run(["node", "scripts/seed.mjs"]);
}

// HOSTNAME：Docker 默认把它设成容器 ID，server.js 会只监听容器网卡，健康检查连 127.0.0.1 就连不上
const [cmd, rest] = command(["node", "server.js"]);
const server = spawn(cmd, rest, { cwd: root, stdio: "inherit", env: { ...process.env, PORT: port, HOSTNAME: "0.0.0.0" } });
for (const signal of ["SIGTERM", "SIGINT"]) process.on(signal, () => server.kill(signal));
server.on("exit", (code, signal) => process.exit(code ?? (signal ? 0 : 1)));

async function warmUp() {
  const base = `http://127.0.0.1:${port}`;
  for (let i = 0; i < 60; i++) {
    const ok = await fetch(`${base}/api/health`).then((r) => r.ok, () => false);
    if (ok) break;
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  for (const page of ["/", "/tutorials", "/tags", "/series", "/sitemap.xml", "/feed.xml"]) {
    await fetch(base + page).catch(() => undefined);
  }
}
void warmUp();
