# 教程网的 Docker 镜像。数据库、上传图片、备份都放在挂载卷里，用 docker-compose.yml 启动：
#   cp .env.example .env   # 填好 AUTH_SECRET、SITE_URL、ADMIN_PASSWORD
#   docker compose up -d --build
# 详见 README「Docker 部署」。

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

# 构建时会预渲染首页等页面，并把站点地址写进 canonical、sitemap、robots.txt，所以 SITE_URL 在这里就要传对。
# 页面渲染要查库：用一个临时空库构建，构建完连同数据缓存一起删掉，运行时用挂载卷里的真实数据库。
ARG SITE_URL=http://localhost:3000
RUN DATABASE_URL=file:/tmp/build.db npx prisma migrate deploy \
 && DATABASE_URL=file:/tmp/build.db SITE_URL="$SITE_URL" AUTH_SECRET=build-time-only-not-used-at-runtime-0123456789 npm run build \
 && rm -rf /tmp/build.db* .next/cache

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
# 保留开发依赖：prisma db seed、npm run admin:reset、npm run backup 这些运维命令要用 tsx 等工具
COPY --from=build --chown=node:node /app /app
RUN mkdir -p /app/data /app/backups /app/public/uploads && chown node:node /app/data /app/backups /app/public/uploads
VOLUME ["/app/data", "/app/public/uploads", "/app/backups"]
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=60s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
# 以 root 启动只为修正挂载目录的属主，随后降到 node 用户运行（见 scripts/docker-start.mjs）
CMD ["node", "scripts/docker-start.mjs"]
