#!/usr/bin/env bash
# 在当前机器的架构上构建镜像并做冒烟测试；PUSH=true 时再按摘要推送到 ghcr.io（不打标签，
# 由 publish 任务把两种架构合成一个多架构镜像后统一打标签），摘要写到步骤输出 digest。
# 用法：docker-build-arch.sh linux/amd64|linux/arm64
set -euo pipefail
platform="$1"
image="ghcr.io/${GITHUB_REPOSITORY,,}"
here="$(cd "$(dirname "$0")" && pwd)"

docker buildx create --use --name tutorial-builder >/dev/null
common=(
  --platform "$platform"
  --build-arg NPM_REGISTRY=https://registry.npmjs.org/
  --build-arg BUILD_REVISION="$GITHUB_SHA"
  --label "org.opencontainers.image.source=https://github.com/$GITHUB_REPOSITORY"
  --label "org.opencontainers.image.revision=$GITHUB_SHA"
  --label "org.opencontainers.image.licenses=MIT"
)

# 先构建到本机做冒烟测试，坏的镜像不会被推送
docker buildx build "${common[@]}" --load -t tutorial-site:smoke .
docker image ls tutorial-site:smoke
bash "$here/docker-smoke.sh" tutorial-site:smoke

if [ "${PUSH:-false}" = "true" ]; then
  echo "$GITHUB_TOKEN" | docker login ghcr.io -u "$GITHUB_ACTOR" --password-stdin
  # 第二次构建全部命中上一步的缓存，只是把同样的结果推送出去
  docker buildx build "${common[@]}" \
    --output "type=image,name=$image,push-by-digest=true,name-canonical=true,push=true" \
    --metadata-file /tmp/build-meta.json .
  digest=$(python3 -c 'import json; print(json.load(open("/tmp/build-meta.json"))["containerimage.digest"])')
  echo "digest=$digest" >> "$GITHUB_OUTPUT"
  echo "已推送 $platform：$image@$digest"
fi
