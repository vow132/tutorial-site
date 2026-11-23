#!/usr/bin/env bash
# 启动镜像做一次冒烟测试：第一次启动建库并写入示例数据、页面用的是运行时的 SITE_URL 和真实数据、重启不会重复写入示例数据。
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

curl -sf http://127.0.0.1:3000/ | grep -q "Flexbox" || { echo "首页没有示例教程" >&2; exit 1; }
curl -sf http://127.0.0.1:3000/robots.txt | grep -q "Sitemap: $site/sitemap.xml" || { echo "robots.txt 没用运行时的 SITE_URL" >&2; exit 1; }
urls=$(curl -sf http://127.0.0.1:3000/sitemap.xml | grep -o "<loc>$site/[^<]*" | wc -l)
[ "$urls" -gt 2 ] || { echo "sitemap 只有 $urls 条运行时地址（还是构建时用空库生成的版本？）" >&2; exit 1; }
curl -sf http://127.0.0.1:3000/ | grep -q "<link rel=\"canonical\" href=\"$site/\"\|<link rel=\"canonical\" href=\"$site\"" || { echo "canonical 没用运行时的 SITE_URL" >&2; exit 1; }

docker restart "$name" >/dev/null
wait_healthy
seeds=$(docker logs "$name" 2>&1 | grep -c "第一次启动" || true)
[ "$seeds" -eq 1 ] || { echo "重启后又写入了一次示例数据" >&2; exit 1; }
echo "✅ 冒烟测试通过：$image"
