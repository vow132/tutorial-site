#!/usr/bin/env bash
# 教程网生产部署脚本（Node.js >= 22.12，推荐 24 LTS；npm、pm2）
# 输出中英文都写（部署时还不知道网站语言）。
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$ROOT_DIR"
export NODE_ENV=production

# Node 20 已于 2026-04 停止维护，不再有安全更新；Prisma 7、sanitize-html 也要求 22.12+。
if ! node -e 'const [a,b]=process.versions.node.split(".").map(Number);process.exit(a>22||(a===22&&b>=12)?0:1)'; then
  echo "❌ 当前 Node.js $(node -v) 过旧，请先升级到 22.12 以上（推荐 24 LTS），步骤见 README「升级 Node.js」。"
  echo "❌ Node.js $(node -v) is too old: upgrade to 22.12 or later (24 LTS recommended); see “Upgrading Node.js” in README.en.md."
  exit 1
fi

echo "=== 1. 安装依赖 / Installing dependencies ==="
# NODE_ENV=production 时 npm 默认跳过 devDependencies，但构建与 seed 需要它们。
npm ci --include=dev

echo "=== 2. 生成 Prisma 客户端 / Generating the Prisma client ==="
npx prisma generate

APP_NAME="${SITE_PM2_APP_NAME:-教程网}"

# PM2 里是否已有正在运行的站点进程（首次部署时没有）。
app_online() {
  command -v pm2 >/dev/null 2>&1 || return 1
  pm2 jlist 2>/dev/null | node -e '
    let raw = "";
    process.stdin.on("data", (chunk) => (raw += chunk)).on("end", () => {
      try {
        const apps = JSON.parse(raw);
        process.exit(apps.some((app) => app.name === process.argv[1] && app.pm2_env?.status === "online") ? 0 : 1);
      } catch {
        process.exit(1);
      }
    });
  ' "$APP_NAME"
}

mkdir -p public/uploads

if app_online; then
  # 生产数据库是 WAL 模式，Prisma 迁移需要独占数据库：站点运行时直接迁移会报
  # database is locked。所以先对快照副本迁移并构建（站点照常服务），最后只在
  # 迁移正式库的几秒钟内停站。
  SNAPSHOT="$ROOT_DIR/.deploy-build.db"
  cleanup_snapshot() { rm -f "$SNAPSHOT" "$SNAPSHOT-wal" "$SNAPSHOT-shm" "$SNAPSHOT-journal"; }
  cleanup_snapshot

  echo "=== 3. 站点正在运行：对数据库快照执行迁移和种子数据 / Site is running: migrating and seeding a database snapshot ==="
  node scripts/db-snapshot.mjs "$SNAPSHOT"
  DATABASE_URL="file:$SNAPSHOT" npx prisma migrate deploy
  DATABASE_URL="file:$SNAPSHOT" npx prisma db seed

  echo "=== 4. 基于快照生产构建（站点继续服务） / Production build from the snapshot (site stays online) ==="
  # Next 的数据缓存（unstable_cache）存在 .next/cache/fetch-cache，而后台改动触发的失效只记在
  # 运行中进程的内存里；不清掉的话，构建可能把失效前的旧数据烘焙进新版本。清掉后构建直接查快照库。
  rm -rf .next/cache/fetch-cache
  DATABASE_URL="file:$SNAPSHOT" npm run build
  cleanup_snapshot

  echo "=== 5. 短暂停站：迁移正式数据库并重启 / Brief stop: migrating the live database and restarting ==="
  pm2 stop "$APP_NAME"
  if ! npx prisma migrate deploy || ! npx prisma db seed; then
    echo "❌ 正式数据库迁移失败（SQLite 迁移在事务中执行，失败的迁移不会留下半成品）。"
    echo "   请查看上面的错误，修复后重新运行 ./deploy.sh；站点当前处于停止状态。"
    echo "❌ Migrating the live database failed (SQLite migrations run in a transaction, so nothing is left half-done)."
    echo "   Check the error above, fix it and run ./deploy.sh again; the site is currently stopped."
    exit 1
  fi
  pm2 startOrRestart ecosystem.config.cjs --update-env
  pm2 save
else
  echo "=== 3. 应用数据库迁移（必须在构建前） / Applying database migrations (before the build) ==="
  npx prisma migrate deploy

  echo "=== 4. 写入种子数据（可重复执行） / Writing seed data (safe to repeat) ==="
  npx prisma db seed

  echo "=== 5. 生产构建 / Production build ==="
  # 先迁移/种子再构建，避免静态主页把空数据库内容烘焙进 .next；清掉旧的数据缓存，构建直接查库。
  rm -rf .next/cache/fetch-cache
  npm run build

  echo "=== 6. 启动 PM2 / Starting PM2 ==="
  pm2 startOrReload ecosystem.config.cjs --update-env
  pm2 save
fi

echo ""
echo "✅ 部署完成 / Deployed"
echo "   访问 / Site:   http://服务器IP:3000（正式上线请用 Nginx/Caddy 提供 HTTPS，见 README「安全加固」 / use Nginx or Caddy with HTTPS before going live, see “Security hardening” in README.en.md）"
echo "   后台 / Admin:  http://服务器IP:3000/admin"
echo "   日志 / Logs:   pm2 logs $APP_NAME"
echo "   备份 / Backup: npm run backup（建议加入 crontab 每日执行 / run it daily from crontab）"