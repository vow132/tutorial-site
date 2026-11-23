# 参与贡献

欢迎提问题、提建议和提交代码。开始之前请先看一下：

- **安全漏洞不要开公开 Issue**，按 [SECURITY.md](SECURITY.md) 私下报告；
- 提 Issue 前先搜一下有没有人提过；报 Bug 时写上后台侧栏底部显示的「程序版本」和部署方式；
- 想做比较大的改动（新功能、改数据库结构、换依赖），先开 Issue 说一下想法，避免做完了方向不合适。

## 开发环境

需要 Node.js >= 22.12（推荐 24 LTS）。

```bash
npm ci
npx prisma generate
npx prisma migrate deploy
npx prisma db seed       # 管理员 admin / admin123456，以及示例分类和教程
npm run dev              # http://localhost:3000，后台 /admin
```

## 提交前检查

```bash
npm run lint
npx tsc --noEmit
npm test                  # 单元测试
npm run build
npm run test:e2e          # 端到端测试（首次运行先 npx playwright install chromium）
```

端到端测试会新建并删除 `e2e-` 开头的数据，**只对开发 / 测试数据库运行**。CI 会在 Node 22 和 24 上跑同样的检查，并单独做依赖安全审计。

## 代码约定

完整的架构说明在 [AGENTS.md](AGENTS.md)，这里列出最容易踩的几条：

- **这是 Next.js 16**：`cookies()`、`headers()`、`params`、`searchParams` 都要 `await`；动态路由的 `params` 不会自动 URL 解码，中文 slug 要 `decodeURIComponent()`。开发和构建都用 webpack，不要切到 Turbopack。
- **鉴权**：每个后台页面都要调用 `requireAdminPage()`，每个 Server Action 都要 `requireAuth()`；`"use server"` 文件里导出的每个函数都会成为可以被直接调用的接口，辅助函数放到普通模块里。
- **前台链接**一律用 `components/intent-link.tsx`，不要直接用 `next/link`。
- **数据库迁移**：给 `Tutorial` 表加字段只能用 `ALTER TABLE "Tutorial" ADD COLUMN …`，不要用 Prisma 自动生成的「新建表 → 拷数据 → 删旧表」，否则全文搜索的触发器会被一起删掉。写完用 `npx prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma` 确认除全文搜索表外没有差异。
- **计数器**（阅读量、反馈数）用原生 SQL 自增，不要用 `prisma.tutorial.update`，否则会刷新 `updatedAt`。
- **敏感数据**（密钥、Token、密码）用 `lib/secret-box.mjs` 加密后存库；新增敏感操作要调用 `audit()` 记入安全日志，需要推送的在 `lib/alerts.ts` 里加上。
- **正文 HTML** 入库和渲染都经过 `lib/sanitize.ts` 白名单；给编辑器加扩展时同步放宽白名单。
- **颜色对比度**：小号辅助文字用 `text-ink-3`，小号强调文字用 `text-accent-ink`；后台填的分类颜色用作文字时加 `cat-text` 类和 `categoryTextStyle()`。
- **站长能在后台改的东西不要写死在代码里**：站长改了仓库文件会挡住一键更新。

## 依赖

- 新增或升级依赖时，选择**发布满两周**的版本，给社区留出发现问题的时间；
- `package-lock.json` 里的下载地址统一用 `registry.npmmirror.com`（国内服务器安装更快）。用官方源安装后执行：

  ```bash
  sed -i 's#https://registry.npmjs.org/#https://registry.npmmirror.com/#g' package-lock.json
  ```

- 有安装脚本的新依赖（原生模块等）要加到 `package.json` 的 `allowScripts`，新版 npm 默认不执行没列出的安装脚本。

## 提交 Pull Request

- 一个 PR 只做一件事，标题和描述写清楚改了什么、为什么改、怎么验证的；
- 界面改动附截图（亮色、暗色、手机宽度）；
- 用户能感知到的改动，在 [CHANGELOG.md](CHANGELOG.md) 顶部的「未发布」下面加一行；
- 提交到 `master` 的 PR 需要 CI 全部通过。

## 发布新版本（维护者）

1. 按[语义化版本](https://semver.org/lang/zh-CN/)确定版本号，修改 `package.json` 和 `package-lock.json` 里的 `version`；
2. 把 CHANGELOG.md 的「未发布」改成新版本号和日期，需要站长手动处理的写进「升级说明」；
3. 合并后打标签 `git tag vX.Y.Z && git push origin vX.Y.Z`，并在 GitHub 上创建 Release。

## 许可

提交代码即表示你同意这些代码按本项目的 [MIT 许可证](LICENSE) 发布。
