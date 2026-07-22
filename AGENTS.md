<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# 教程网（商业级图文教程平台）

## 技术栈
- **Next.js 16.2 (App Router) + React 19 + TypeScript**，dev/build 均使用 **webpack**（Turbopack 在中文路径下会间歇 500，勿切回）
- **Tailwind CSS v4**（CSS 变量主题，见 `app/globals.css` 的 `@theme`）
- **Prisma 7 + SQLite**（driver adapter 模式，无 Rust 引擎）
- **Tiptap 3** 富文本编辑器（后台发文）
- **framer-motion** 动效（滚动显现/导航滑块）

## 常用命令
```bash
npm run dev          # 开发（已固定 --webpack）
npm run build        # 生产构建（已固定 --webpack）
npx prisma migrate dev   # 改 schema 后迁移
npx prisma db seed       # 写入种子数据（管理员/分类/示例教程）
npx prisma generate      # 重新生成客户端到 generated/prisma/
```

## 关键架构决策
- **管理员认证**：自研 HMAC 签名会话（`lib/session.ts`），bcrypt 存密码；路由守卫在 `proxy.ts`（Next 16 中 middleware 已改名 proxy，runtime 仅 nodejs）
- **Prisma 7**：schema 里 datasource **不能写 url**，连接串在 `prisma.config.ts`；客户端用 `new PrismaClient({ adapter: new PrismaBetterSqlite3({ url }) })`（`lib/prisma.ts`），生成代码在 `generated/prisma/`
- **Next 16 async APIs**：`cookies()`/`headers()`/`params`/`searchParams` 全部要 `await`；**动态路由 params 不会自动 URL 解码，含中文 slug 必须 `decodeURIComponent()`**
- **内容流**：Tiptap 产 HTML 存库 → 前台 `lib/article.ts` 服务端提取 TOC + highlight.js 高亮 → `dangerouslySetInnerHTML` 渲染
- **图片上传**：编辑器拖拽/粘贴 → `POST /api/upload`（鉴权+类型/5MB 校验）→ 存 `public/uploads/`
- 后台结构：`app/admin/login`（登录页）+ `app/admin/(panel)/*`（带侧边栏的面板路由组）
- **站点设置**：`Setting` 表（key-value，单行 key=`site`，JSON 存全部设置）；类型/默认值/读取在 `lib/settings.ts`（`getSettings()` 自动回退默认值）；后台编辑在 `/admin/settings`（底部栏目是客户端 JSON 编辑器，`autoCategories: true` 的栏目自动输出分类链接）；前台 layout/页脚/首页 Hero 均从 `getSettings()` 取数
- Server Actions 在 `lib/actions/`，每个都必须 `requireAuth()`；变更后 `revalidatePath`

## 默认账号
- 后台 `/admin`：`admin / admin123456`（见 `.env`，生产环境务必修改并更换 `AUTH_SECRET`）

## 设计风格
- 极简白（#f7f8fa 底 + 白卡片 + 1px #e9ebf0 边）+ 靛蓝 #6366f1 点缀
- 参考 vps.sbai.shop：悬浮胶囊导航（激活项 aura+shine 动效）、鼠标跟随小幽灵吉祥物、glow-card 聚光灯+3D 倾斜
