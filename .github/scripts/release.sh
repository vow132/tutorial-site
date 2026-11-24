#!/usr/bin/env bash
# master 更新后：package.json 的版本还没有对应的 vX.Y.Z 标签时，自动发版——
#   1. 在这个提交上创建标签和 GitHub Release，说明取自 CHANGELOG.md 里这个版本的那一节；
#   2. 给刚发布的镜像（sha-<提交号>）加上 X.Y.Z / X.Y / X 标签。
# 用 GITHUB_TOKEN 创建的标签不会再触发其他工作流，所以镜像的版本标签在这里一起打，不用重新构建。
# 发新版本只要在 PR 里改 package.json 的 version 和 CHANGELOG.md，合并即可。
# DRY_RUN=1 时只打印要做的事（本地检查用）。
set -euo pipefail

version=$(node -p 'require("./package.json").version')
if [[ ! "$version" =~ ^([0-9]+)\.([0-9]+)\.([0-9]+)$ ]]; then
  echo "版本号 $version 不是 X.Y.Z 格式，不自动发版"
  exit 0
fi
major="${BASH_REMATCH[1]}"; minor="${BASH_REMATCH[2]}"
tag="v$version"

if [ -z "${DRY_RUN:-}" ] && git ls-remote --exit-code --tags origin "refs/tags/$tag" >/dev/null 2>&1; then
  echo "$tag 已经发布过，跳过"
  exit 0
fi

# CHANGELOG 里「## [X.Y.Z]」到下一个「## [」之间的内容
notes=$(awk -v v="$version" '
  index($0, "## [" v "]") == 1 { found = 1; next }
  found && /^## \[/ { exit }
  found && !/^\[[^]]+\]: / { print }
' CHANGELOG.md | sed -e '/./,$!d')
[ -n "$notes" ] || notes="详见 [CHANGELOG.md](CHANGELOG.md)。"
image="ghcr.io/${GITHUB_REPOSITORY,,}"
notes+=$'\n\n'"Docker 镜像：\`$image:$version\`（amd64 / arm64）"

if [ -n "${DRY_RUN:-}" ]; then
  echo "将创建 $tag（提交 ${GITHUB_SHA:-HEAD}），镜像标签 $version / $major.$minor$([ "$major" != 0 ] && echo " / $major")"
  echo "----- Release 说明 -----"
  echo "$notes"
  exit 0
fi

tags=(-t "$image:$version" -t "$image:$major.$minor")
[ "$major" != "0" ] && tags+=(-t "$image:$major")
docker buildx imagetools create "${tags[@]}" "$image:sha-${GITHUB_SHA::7}"
gh release create "$tag" --target "$GITHUB_SHA" --title "$tag" --notes "$notes"
{
  echo "### 已发布 $tag"
  echo "- GitHub Release：$tag"
  for tag_arg in "${tags[@]}"; do [ "$tag_arg" != "-t" ] && echo "- \`$tag_arg\`"; done
} >> "$GITHUB_STEP_SUMMARY"
