# 教程网

基于 Next.js 16.2（App Router + webpack）、React 19、Tailwind CSS v4、Prisma 7 + SQLite 的商业级图文教程平台。

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
AUTH_SECRET="请替换为随机长字符串"
# 只有站点全程 HTTPS 时才设为 true；直接用 http://IP:3000 时保持 false
SESSION_COOKIE_SECURE="false"
```

`DATABASE_URL` 的相对路径以项目根目录为基准。PM2 配置已经固定 `cwd`，运行时和 Prisma CLI 会使用同一个数据库文件。

## 管理员账号修改

登录后台后进入侧栏 **账号安全**（`/admin/account`）：

- 修改用户名时需要输入当前密码确认；
- 新密码至少 8 位，可只修改用户名而不改密码；
- 保存后当前浏览器自动换发会话，旧凭据指纹对应的会话会失效。

## 主页空白/卡顿修复说明

此前首页内容由 Framer Motion 在客户端 hydration 后从 `opacity: 0` 显示。如果服务器反向代理延迟或丢失 JS chunk，就会只剩页头和页尾。现在渐显改为 CSS 增强，服务端 HTML 默认可见，即使 JS 未加载也能正常阅读；公共卡片、吉祥物和搜索框也改为轻量服务端/CSS 实现。列表查询只选择展示字段，不再把整篇正文带入首页。

若使用 Nginx，确保 `/_next/static`等静态资源路径完整转发到 Next，并在发布新版本时整体替换 `.next` 后再重载 PM2。