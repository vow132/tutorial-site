#!/usr/bin/env bash
# 教程网生产部署脚本（Node.js >= 20.9、npm、pm2）
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$ROOT_DIR"
export NODE_ENV=production

echo "=== 1. 安装依赖 ==="
npm ci

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
echo "   访问: http://服务器IP:3000"
echo "   后台: http://服务器IP:3000/admin"
echo "   日志: pm2 logs 教程网"