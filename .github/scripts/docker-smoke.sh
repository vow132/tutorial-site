#!/usr/bin/env bash
# 启动镜像做一次冒烟测试：第一次启动建库并写入示例数据、页面用的是运行时的 SITE_URL 和真实数据、
# 分享图和图标能生成、运维命令（备份、还原、清理、重置管理员、迁移）都能用、重启不会重复写入示例数据；
# 不设 ADMIN_PASSWORD 时走首次安装页。
# 用法：docker-smoke.sh <镜像>
set -euo pipefail
image="$1"
name="smoke-$$"
site="https://example.test"

cleanup() {
  status=$?
  if [ "$status" -ne 0 ]; then
    echo "::group::容器日志"
    docker logs "$name" 2>&1 || true
    echo "::endgroup::"
  fi
  docker rm -f "$name" >/dev/null 2>&1 || true
  exit "$status"
}
trap cleanup EXIT

# 先把输出存下来再查：开着 pipefail 时 `命令 | grep -q` 会在 grep 找到后提前退出，
# 前面的命令收到 SIGPIPE（退出码 141），整条管道就算失败了（输出越长越容易碰上）
has() { grep -q -- "$2" <<<"$1"; }

wait_healthy() {
  for _ in $(seq 1 90); do
    curl -sf http://127.0.0.1:3000/api/health >/dev/null && return 0
    sleep 2
  done
  echo "服务没有在 3 分钟内就绪" >&2
  return 1
}

docker run -d --name "$name" -p 3000:3000 \
  -e AUTH_SECRET=ci-smoke-test-only-never-use-in-production \
  -e ADMIN_PASSWORD=ci-admin-password \
  -e SITE_URL="$site" \
  "$image" >/dev/null
wait_healthy

home=$(curl -sf http://127.0.0.1:3000/)
has "$home" "Flexbox" || { echo "首页没有示例教程" >&2; exit 1; }
has "$(curl -sf http://127.0.0.1:3000/robots.txt)" "Sitemap: $site/sitemap.xml" || { echo "robots.txt 没用运行时的 SITE_URL" >&2; exit 1; }
urls=$(curl -sf http://127.0.0.1:3000/sitemap.xml | grep -o "<loc>$site/[^<]*" | wc -l)
[ "$urls" -gt 2 ] || { echo "sitemap 只有 $urls 条运行时地址（还是构建时用空库生成的版本？）" >&2; exit 1; }
has "$home" "<link rel=\"canonical\" href=\"$site/\"\|<link rel=\"canonical\" href=\"$site\"" || { echo "canonical 没用运行时的 SITE_URL" >&2; exit 1; }

curl -sf -o /dev/null http://127.0.0.1:3000/og/site || { echo "分享图生成失败（字体文件没打进镜像？）" >&2; exit 1; }
curl -sf -o /dev/null "http://127.0.0.1:3000/brand/icon?s=192" || { echo "网站图标生成失败" >&2; exit 1; }

# 镜像里只有 standalone 输出和整理进去的脚本（scripts/docker-runtime.mjs），逐个确认运维命令能用
in_app() { docker exec -u node "$name" "$@" >/dev/null || { echo "容器里执行失败：$*" >&2; exit 1; }; }
in_app npm run -s backup
in_app npm run -s uploads:clean
in_app npm run -s images:variants
in_app npm run -s migrate
latest=$(docker exec -u node "$name" sh -c 'ls -t /app/backups/*.db.gz | head -1')
in_app npm run -s backup:restore -- "$latest"
in_app npm run -s admin:reset -- --password "ci-reset-Passw0rd-123"

docker restart "$name" >/dev/null
wait_healthy
seeds=$(docker logs "$name" 2>&1 | grep -c "第一次启动" || true)
[ "$seeds" -eq 1 ] || { echo "重启后又写入了一次示例数据" >&2; exit 1; }
docker rm -f "$name" >/dev/null

# 不设 ADMIN_PASSWORD：不建账号，日志里给出安装地址和安装码，后台地址都带到安装页
docker run -d --name "$name" -p 3000:3000 \
  -e AUTH_SECRET=ci-smoke-test-only-never-use-in-production \
  -e SITE_URL="$site" \
  "$image" >/dev/null
wait_healthy
has "$(docker logs "$name" 2>&1)" "安装码" || { echo "没有 ADMIN_PASSWORD 时日志里没有安装码" >&2; exit 1; }
location=$(curl -s -o /dev/null -w "%{redirect_url}" http://127.0.0.1:3000/admin/login)
[[ "$location" == */admin/setup ]] || { echo "没有账号时登录页没有带到安装页（$location）" >&2; exit 1; }
has "$(curl -sf http://127.0.0.1:3000/admin/setup)" "先完成安装" || { echo "安装页打不开" >&2; exit 1; }
has "$(docker exec -u node "$name" npm run -s setup:code)" "安装码" || { echo "npm run setup:code 没有输出安装码" >&2; exit 1; }
echo "✅ 冒烟测试通过：$image"
