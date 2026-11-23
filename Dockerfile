# 教程网的 Docker 镜像。一般不用自己构建：docker-compose.yml 默认拉取 GitHub 自动构建好的
# ghcr.io/vow132/tutorial-site（amd64 / arm64），详见 README「Docker 部署」。
# 改了代码想自己构建：docker compose -f docker-compose.yml -f docker-compose.build.yml up -d --build
#
# 镜像和站点无关：站点地址（SITE_URL）、密钥等都在运行时由 .env 传入，数据库、上传图片、备份都在挂载卷里。

FROM node:24-bookworm-slim AS build
WORKDIR /app

# python3 / make / g++：better-sqlite3 下载不到预编译包时现场编译；
# openssl：Prisma 按系统里的 libssl 版本选择迁移引擎，构建和运行两个阶段都要装，选中的引擎才一致。
# APT_MIRROR 可选：国内服务器拉 Debian 软件包慢时填 mirrors.aliyun.com、mirrors.tuna.tsinghua.edu.cn 等
ARG APT_MIRROR=
RUN if [ -n "$APT_MIRROR" ]; then sed -i "s|deb.debian.org|$APT_MIRROR|g" /etc/apt/sources.list.d/debian.sources; fi \
 && apt-get update \
 && apt-get install -y --no-install-recommends python3 make g++ openssl \
 && rm -rf /var/lib/apt/lists/*

# npm 镜像：默认国内的 npmmirror（和 package-lock.json 一致）；海外服务器可改成 https://registry.npmjs.org/
ARG NPM_REGISTRY=https://registry.npmmirror.com/
COPY package.json package-lock.json ./
RUN npm ci --registry="$NPM_REGISTRY" --replace-registry-host=always --no-audit --no-fund

COPY . .
RUN npx prisma generate

# 页面渲染要查库：用一个临时空库构建，构建完连同数据缓存一起删掉。构建时生成的页面不带真实数据和站点地址，
# 容器启动时会被 scripts/docker-start.mjs 删掉、按运行时的 SITE_URL 和数据库重新生成。
# BUILD_REVISION：提交号，显示在后台侧栏（镜像里没有 .git，CI 构建时传入）。
ARG BUILD_REVISION=
RUN DATABASE_URL=file:/tmp/build.db npx prisma migrate deploy \
 && DATABASE_URL=file:/tmp/build.db BUILD_REVISION="$BUILD_REVISION" AUTH_SECRET=build-time-only-not-used-at-runtime-0123456789 npm run build \
 && rm -rf /tmp/build.db* .next/cache

# 运行用不到的开发依赖（ESLint、Playwright、TypeScript、Tailwind 编译器）和 musl 版原生包（镜像是 glibc）删掉，
# 运维命令要用的 prisma、tsx、dotenv 在 dependencies 里，会保留。
RUN npm prune --omit=dev --no-audit --no-fund \
 && rm -rf node_modules/@next/swc-*-musl node_modules/@img/*linuxmusl* \
 && npm cache clean --force

FROM node:24-bookworm-slim
WORKDIR /app
ARG APT_MIRROR=
RUN if [ -n "$APT_MIRROR" ]; then sed -i "s|deb.debian.org|$APT_MIRROR|g" /etc/apt/sources.list.d/debian.sources; fi \
 && apt-get update \
 && apt-get install -y --no-install-recommends openssl \
 && rm -rf /var/lib/apt/lists/*
ENV NODE_ENV=production \
    DEPLOY_MODE=docker \
    PORT=3000 \
    DATABASE_URL=file:/app/data/tutorial.db \
    BACKUP_DIR=/app/backups \
    NEXT_TELEMETRY_DISABLED=1
COPY --from=build --chown=node:node /app /app
RUN mkdir -p /app/data /app/backups /app/public/uploads && chown node:node /app/data /app/backups /app/public/uploads
VOLUME ["/app/data", "/app/public/uploads", "/app/backups"]
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=60s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
# 以 root 启动只为修正挂载目录的属主，随后降到 node 用户运行（见 scripts/docker-start.mjs）
CMD ["node", "scripts/docker-start.mjs"]
