# 教程网

基于 Next.js 16.2（App Router + webpack）、React 19、Tailwind CSS v4、Prisma 7 + SQLite 的图文教程平台。

## 免责声明
本站教程仅供个人合法学习研究，严禁用于违法、侵权等行为。用户使用内容产生的一切实操后果自行承担，与本站无关。
本站不保证内容绝对无误，有权随时调整内容；
如发现违规，我方保留配合调查的权利。访问本站即同意本声明。
## 项目预览

| 首页（亮色） | 首页（暗色） |
| --- | --- |
| ![首页亮色](docs/screenshots/home-light.png) | ![首页暗色](docs/screenshots/home-dark.png) |

| 最新教程 | 文章阅读 |
| --- | --- |
| ![最新教程](docs/screenshots/home-latest.png) | ![文章阅读](docs/screenshots/article.png) |

| 管理后台 |
| --- |
| ![管理后台](docs/screenshots/admin.png) |

## 功能特性

- **前台**：悬浮胶囊导航（分类翻页、aura/流光动效）、亮暗双主题（跟随手动切换持久化）、鼠标跟随聚光灯卡片与轻微 3D 倾斜、滚动触发的分区渐显、小幽灵吉祥物
- **文章**：服务端 TOC 提取与高亮（highlight.js）、移动端可折叠目录、图片自动注入宽高防布局抖动、上下篇导航
- **后台**：Tiptap 3 富文本编辑器（拖拽/粘贴上传图片）、分类树管理（最多三级、防循环依赖）、站点设置可视化编辑、账号安全
- **SEO 与健壮性**：动态 sitemap / robots、OpenGraph 元信息、真实 404 状态码、越界分页自动收敛、空/加载/错误状态齐全
- **安全**：HMAC 签名会话（`timingSafeEqual` + 密码指纹轮换）、bcrypt(12) 密码、登录限流、上传类型/大小校验与 SVG 消毒、Server Actions 全量鉴权

## 本地运行

```bash
npm ci
npx prisma generate
npx prisma migrate deploy
npx prisma db seed
npm run dev
```

打开 `http://localhost:3000`，后台为 `/admin`。

## 生产部署

服务器要求：Node.js >= 20.9、npm、PM2。推荐使用项目根目录的脚本：

```bash
bash deploy.sh
```

脚本会按“安装依赖 → Prisma generate → migrate → seed → build → PM2 平滑重载”的顺序执行。迁移和种子数据必须在 `npm run build` 之前完成，否则静态主页可能把空数据库内容生成到 `.next` 中。

### 环境变量

在服务器设置 `.env.production`：

```dotenv
DATABASE_URL="file:./prisma/dev.db"
ADMIN_USERNAME="admin"
ADMIN_PASSWORD="请修改为强密码"
# 会话签名密钥：必须替换为随机长字符串（openssl rand -base64 48），
# 使用已知占位值时生产环境会拒绝启动
AUTH_SECRET="请替换为随机长字符串"
# 只有站点全程 HTTPS 时才设为 true；直接用 http://IP:3000 时保持 false
SESSION_COOKIE_SECURE="false"
# 站点对外地址（用于 sitemap / OpenGraph 的绝对链接），如：
# SITE_URL="https://example.com"
SITE_URL="http://localhost:3000"
```

`DATABASE_URL` 的相对路径以项目根目录为基准。PM2 配置已经固定 `cwd`，运行时和 Prisma CLI 会使用同一个数据库文件。

### 后台 GitHub 入口与一键更新

仪表盘右上角「写教程」旁的 GitHub 图标会打开 `vow132/tutorial-site`。右上角圆点每 5 分钟检测一次仓库的 `master` 分支：绿色表示无需更新，黄色表示有新版本，点击黄色圆点直接提交更新任务；灰色表示正在检测或无法自动更新，红色表示失败，点击可查看原因。更新中的黄色圆点会显示当前步骤，成功后页面自动刷新。

一键更新适用于 **Linux + 单个 PM2 fork 模式进程** 的 Git 部署，默认进程名称为 `教程网`，需要 Git、npm、目录写入权限以及 GitHub / npm 网络访问。本地开发、Windows 或无 Git 的部署只检测版本。服务器存在未提交修改、运行版本与 Git 目录不一致、仓库历史分叉时，会停止自动更新。

可选服务器环境变量（`.env.production`）：

```dotenv
SITE_AUTO_UPDATE="true"        # 设为 false 可关闭一键更新
SITE_UPDATE_BRANCH="master"   # 要检测和部署的仓库分支
SITE_PM2_APP_NAME="教程网"      # 已运行的单个 PM2 进程名称
# GITHUB_TOKEN="..."          # 可选，只在服务端使用，提升 GitHub API 检测额度
```

GitHub API 令牌仅用于版本检测；拉取源码使用服务器已配置的 Git 凭据。当前公共仓库无需凭据。生产构建会记录 Git 提交，检测时比较正在运行的构建版本，不能仅靠 `git pull` 改变版本圆点。

更新任务在独立进程中执行：下载固定提交 → 安装依赖 → 对数据库副本迁移并构建 → 暂停旧服务 → 备份最新数据库 → 对真实数据库迁移 → 切换 PM2 → 检查版本和服务健康。构建期间原网站继续运行，切换期间会短暂中断；切换失败会尝试恢复数据库和原版本，并验证恢复后的服务。更新不会运行 seed，已有教程、账号和设置保留；上传目录始终共享原项目的 `public/uploads`。

更新状态和日志在 `.updates/status.json`、`.updates/worker.log`。发布目录、数据库备份与旧 PM2 配置也保存在 `.updates/`，供手动恢复；这些文件含站点数据或环境配置，请限制权限并留意磁盘空间，清理前确认目录不是正在运行的版本。

**首次自动更新后，PM2 使用 `.updates/active.config.cjs` 启动新版本**，并通过 `pm2 save` 持久化。以后手动启动请使用：

```bash
pm2 startOrReload .updates/active.config.cjs --update-env
```

原始 Git 工作目录不被自动更新覆盖；再次执行原目录的 `deploy.sh` 或 `ecosystem.config.cjs` 会部署原目录代码。`SITE_UPDATE_ROOT` 必须保持为原项目的绝对路径（初始 PM2 配置和更新脚本自动设置），数据库使用同一共享文件。

验证更新模块而不执行真实部署：

```bash
node --import tsx --test lib/site-update.test.ts
node --test scripts/site-update.test.mjs
```

## 管理员账号修改

登录后台后进入侧栏 **账号安全**（`/admin/account`）：

- 修改用户名时需要输入当前密码确认；
- 新密码至少 8 位，可只修改用户名而不改密码；
- 保存后当前浏览器自动换发会话，旧凭据指纹对应的会话会失效。

登录接口内置限流：同一用户名 15 分钟内连续 5 次失败后暂时锁定。
