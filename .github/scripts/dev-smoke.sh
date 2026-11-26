#!/usr/bin/env bash
# 开发模式冒烟测试：`npm run dev` 能起来，首页、示例文章页、后台登录页都返回 200。
# CI 的其他步骤只测生产构建；开发模式坏了（比如 instrumentation 在 edge 编译里解析数据库模块，全站 500）
# 不会有人发现，而这正是别人拿到源码后第一个要跑的命令。
# 用法：bash .github/scripts/dev-smoke.sh（需要已经迁移并写入种子数据的数据库）
set -euo pipefail
port="${PORT:-3300}"
log="$(mktemp)"

# 单独的进程组，结束时连同 Next 派生的子进程一起停掉
setsid node node_modules/next/dist/bin/next dev --webpack -p "$port" >"$log" 2>&1 &
pid=$!
cleanup() {
  kill -- "-$pid" 2>/dev/null || true
  wait "$pid" 2>/dev/null || true
}
trap cleanup EXIT

for _ in $(seq 1 60); do
  [ "$(curl -s -o /dev/null -w "%{http_code}" "http://127.0.0.1:$port/api/health" || true)" != "000" ] && break
  sleep 2
done

status=0
for path in / /tutorials/css-flexbox-guide /admin/login; do
  # 开发模式第一次打开每个页面都要现编译，给足时间
  code=$(curl -s -o /dev/null -w "%{http_code}" --max-time 180 "http://127.0.0.1:$port$path" || true)
  echo "$path → $code"
  [ "$code" = 200 ] || status=1
done

if [ "$status" -ne 0 ]; then
  echo "::group::开发服务器日志"
  cat "$log"
  echo "::endgroup::"
fi
exit "$status"
