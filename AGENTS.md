<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# 教程网（商业级图文教程平台）

## 技术栈
- **运行时 Node.js >= 22.12**（推荐 24 LTS；Node 20 已停止维护，Prisma 7、sanitize-html 也要求 22.12+），CI 在 22、24 上都跑
- **Next.js 16.4 (App Router) + React 19 + TypeScript**，dev/build 均使用 **webpack**（Turbopack 在中文路径下会间歇 500，勿切回）
- **Tailwind CSS v4**（CSS 变量主题，见 `app/globals.css` 的 `@theme`；语义类 `bg-surface`/`bg-btn`/`bg-scrim`/`shadow-capsule`，`dark:` 变体跟随 `data-theme`）
- **Prisma 7 + SQLite**（driver adapter 模式，无 Rust 引擎）
- **Tiptap 3** 富文本编辑器（后台发文）
- 动效为纯 CSS + `components/pointer-aura.tsx` 单个全局指针监听器（聚光灯跟随/3D 倾斜/吉祥物跟随；滚动渐显用 CSS scroll-driven animation 渐进增强；不依赖 framer-motion）

## 常用命令
```bash
npm run dev          # 开发（已固定 --webpack）
npm run build        # 生产构建（已固定 --webpack）
npx prisma migrate dev   # 改 schema 后迁移
npx prisma db seed       # 写入种子数据（管理员/分类/示例教程）
npx prisma generate      # 重新生成客户端到 generated/prisma/
npm test                 # 单元测试（lib/*.test.ts + scripts/*.test.mjs）
npm run backup           # SQLite 在线备份到 backups/
npm run admin:reset      # 应急：重置管理员密码、关闭两步验证、退出所有设备
```

## 关键架构决策
- **管理员认证**：HMAC 签名 Cookie（`lib/session.ts`）+ 服务端 `AdminSession` 表（`lib/admin-auth.ts`，删行即吊销），bcrypt(12) 存密码，可选 TOTP 两步验证（`lib/totp.ts`）；`proxy.ts` 只验签名（Next 16 中 middleware 已改名 proxy，runtime 仅 nodejs），**每个后台页面都要 `requireAdminPage()`**，不能只靠 layout
- **登录限流**：`lib/rate-limit.ts` 进程内 LRU 计数器，只记失败；带 `admin_device` 受信任设备 Cookie 的浏览器单独计数。访客 IP 只有 `TRUST_PROXY=true` 时才从代理头读取（`lib/client-ip.ts`）
- **安全日志**：敏感操作调用 `audit()`（`lib/audit.ts`），后台 `/admin/audit` 查看
- **Prisma 7**：schema 里 datasource **不能写 url**，连接串在 `prisma.config.ts`；客户端用 `new PrismaClient({ adapter: new PrismaBetterSqlite3({ url }) })`（`lib/prisma.ts`），生成代码在 `generated/prisma/`
- **Next 16 async APIs**：`cookies()`/`headers()`/`params`/`searchParams` 全部要 `await`；**动态路由 params 不会自动 URL 解码，含中文 slug 必须 `decodeURIComponent()`**
- **内容流**：Tiptap 产 HTML → `sanitizeArticleHtml()`（`lib/sanitize.ts`，入库和渲染各过滤一次）→ 前台 `lib/article.ts` 服务端提取 TOC + highlight.js 高亮 → `dangerouslySetInnerHTML` 渲染。新增编辑器扩展时同步放宽白名单
- **图片上传**：编辑器拖拽/粘贴 → `POST /api/upload`（鉴权 + 文件头识别 PNG/JPG/GIF/WebP + 5MB；不接受 SVG）→ sharp 缩放到 1600px 宽、转 WebP、去 EXIF（GIF 原样）→ 存 `public/uploads/`。`next start` 只在启动时扫描 public，启动后新增的文件由 `app/uploads/[name]/route.ts` 兜底提供
- **安全响应头**：CSP/HSTS/nosniff 等统一在 `next.config.ts` 的 `headers()`；HSTS 只在 `X-Forwarded-Proto: https` 时下发，`/uploads/*` 带 `sandbox` CSP
- 后台结构：`app/admin/login`（登录页）+ `app/admin/(panel)/*`（带侧边栏的面板路由组）
- **前台链接**：一律用 `components/intent-link.tsx`（悬停/触摸/聚焦时才预取），不要直接用 `next/link`，否则每个页面会对视口内所有链接发预取请求
- **前台数据缓存**：分类、设置、教程列表经 `unstable_cache` 缓存（`lib/public-data.ts` 的 `CACHE_TAGS`）；后台改动后在 Server Action 里 `revalidateTag(tag, { expire: 0 })`。缓存以 JSON 存储，Date 需自行还原
- **动效与首屏**：首屏最大的元素（首页大标题、文章标题/正文）用 `<Reveal fade={false}>` 只做位移，避免从透明淡入拖慢 LCP；桌面导航 hydration 前用 CSS 断点渲染三档分页，避免跳动
- **颜色对比度**：辅助文字 `text-ink-3`（#6b7280）、小号强调文字用 `text-accent-ink`（#4f46e5），`text-accent` 只用于大字号、图标和背景
- **站点设置**：`Setting` 表（key-value，单行 key=`site`，JSON 存全部设置）；类型/默认值/读取在 `lib/settings.ts`（`getSettings()` 自动回退默认值）；后台编辑在 `/admin/settings`（底部栏目是客户端 JSON 编辑器，`autoCategories: true` 的栏目自动输出分类链接）；前台 layout/页脚/首页 Hero 均从 `getSettings()` 取数
- Server Actions 在 `lib/actions/`，每个都必须 `requireAuth()`；变更后 `revalidatePath`。`"use server"` 文件里导出的每个函数都会成为可被直接调用的接口，辅助函数放到普通模块中

## 默认账号
- 后台 `/admin`：开发环境 `admin / admin123456`；生产环境未设置 `ADMIN_PASSWORD` 时 seed 会随机生成密码并打印。务必设置随机 `AUTH_SECRET`

## 设计风格
- 极简白（#f7f8fa 底 + 白卡片 + 1px #e9ebf0 边）+ 靛蓝 #6366f1 点缀
- 参考 vps.sbai.shop：悬浮胶囊导航（激活项 aura+shine 动效）、鼠标跟随小幽灵吉祥物、glow-card 聚光灯+3D 倾斜
