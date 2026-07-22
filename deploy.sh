#!/bin/bash
# ==============================================
# 教程网 · Linux 服务器一键部署脚本
# 使用方法: bash deploy.sh
# 前提条件: Node.js >= 20.9, npm, git, pm2
# ==============================================
set -e

echo "=== 1. 克隆/更新代码 ==="
# 请改为你的仓库地址，或用 scp/rsync 直接上传
# git pull origin main

echo "=== 2. 安装依赖（包含 devDependencies，用于构建） ==="
npm ci

echo "=== 3. 生成 Prisma 客户端 ==="
npx prisma generate

echo "=== 4. 构建 ==="
npm run build

echo "=== 5. 初始化/迁移数据库 ==="
npx prisma migrate deploy

echo "=== 6. 写入种子数据（首次部署必用，重复执行安全） ==="
npx prisma db seed

echo "=== 7. 确保 uploads 目录存在 ==="
mkdir -p public/uploads

echo "=== 8. 启动 PM2 ==="
pm2 start ecosystem.config.cjs --update-env
pm2 save

echo ""
echo "✅ 部署完成！"
echo "   访问 http://服务器IP:3000"
echo "   后台 http://服务器IP:3000/admin"
echo "   日志查看: pm2 logs 教程网"
echo "   重启应用: pm2 restart 教程网"
