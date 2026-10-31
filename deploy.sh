#!/usr/bin/env bash
# 教程网生产部署脚本（Node.js >= 22.12，推荐 24 LTS；npm、pm2）
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$ROOT_DIR"
export NODE_ENV=production

# Node 20 已于 2026-04 停止维护，不再有安全更新；Prisma 7、sanitize-html 也要求 22.12+。
if ! node -e 'const [a,b]=process.versions.node.split(".").map(Number);process.exit(a>22||(a===22&&b>=12)?0:1)'; then
  echo "❌ 当前 Node.js $(node -v) 过旧，请先升级到 22.12 以上（推荐 24 LTS），步骤见 README「升级 Node.js」。"
  exit 1
fi

echo "=== 1. 安装依赖 ==="
# NODE_ENV=production 时 npm 默认跳过 devDependencies，但构建与 seed 需要它们。
npm ci --include=dev

echo "=== 2. 生成 Prisma 客户端 ==="
npx prisma generate

echo "=== 3. 应用数据库迁移（必须在构建前） ==="
npx prisma migrate deploy

echo "=== 4. 写入种子数据（可重复执行） ==="
npx prisma db seed

echo "=== 5. 准备上传目录 ==="
mkdir -p public/uploads

echo "=== 6. 生产构建 ==="
# 先迁移/种子再构建，避免静态主页把空数据库内容烘焙进 .next。
npm run build

echo "=== 7. 启动或平滑重载 PM2 ==="
pm2 startOrReload ecosystem.config.cjs --update-env
pm2 save

echo ""
echo "✅ 部署完成"
echo "   访问: http://服务器IP:3000（正式上线请用 Nginx/Caddy 提供 HTTPS，见 README「安全加固」）"
echo "   后台: http://服务器IP:3000/admin"
echo "   日志: pm2 logs 教程网"
echo "   备份: npm run backup（建议加入 crontab 每日执行）"