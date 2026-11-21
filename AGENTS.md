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
npm run test:e2e         # 端到端测试（Playwright，需先 npm run build；会建/删 e2e- 前缀的数据，勿连生产库）
npm run backup           # SQLite 在线备份到 backups/（设置 BACKUP_PASSPHRASE 时加密为 .db.gz.enc）
npm run backup:restore -- <文件>  # 把备份解为独立的 restored-*.db 并做完整性检查（不动线上库）
npm run uploads:clean    # 列出没被引用的上传图片（-- --apply 移到 uploads-trash/）
npm run admin:reset      # 应急：重置管理员密码、关闭两步验证（含恢复码）、删除通行密钥、退出所有设备
```

## 关键架构决策
- **管理员认证**：HMAC 签名 Cookie（`lib/session.ts`）+ 服务端 `AdminSession` 表（`lib/admin-auth.ts`，删行即吊销），bcrypt(12) 存密码，可选 TOTP 两步验证（`lib/totp.ts`）；`proxy.ts` 只验签名（Next 16 中 middleware 已改名 proxy，runtime 仅 nodejs），**每个后台页面都要 `requireAdminPage()`**，不能只靠 layout
- **通行密钥**：`@simplewebauthn/server` + `browser`（浏览器端只在点击时动态加载）。RP ID/Origin 取自 `SITE_URL`（`lib/passkeys.ts` 的 `relyingParty()`，要求域名 + HTTPS，localhost 例外）；挑战放在签名 Cookie 里、一次性使用；可发现凭据 + `userVerification: "required"`，所以通行密钥登录跳过 TOTP。登记要输当前密码。e2e 用 Chromium 虚拟认证器、以 `http://localhost` 访问（WebAuthn 不接受 IP）
- **敏感字段静态加密**：两步验证密钥、告警配置用 `lib/secret-box.mjs`（AES-256-GCM，`enc:v1:` 前缀，密钥取 `DATA_ENCRYPTION_KEY`，否则由 `AUTH_SECRET` 派生）加密存库，读取时兼容旧明文；`instrumentation.ts` 启动时把明文/旧密钥数据重新加密（`lib/secret-migration.ts`）。新增需要保密的字段时同样走这里，并给一个独立的 purpose
- **两步验证**：校验统一走 `lib/second-factor.ts` 的 `verifySecondFactor()`（6 位验证码或一次性恢复码，均为条件更新/删除防并发重放）；恢复码只存 SHA-256（`AdminRecoveryCode` 表），关闭两步验证和 `admin:reset` 时一并删除
- **登录限流**：`lib/rate-limit.ts` 进程内 LRU 计数器，只记失败；带 `admin_device` 受信任设备 Cookie 的浏览器单独计数。访客 IP 只有 `TRUST_PROXY=true` 时才从代理头读取（`lib/client-ip.ts`）
- **安全日志**：敏感操作调用 `audit()`（`lib/audit.ts`），后台 `/admin/audit` 查看
- **安全告警**：`audit()` 写完日志后按动作名决定是否推送（映射在 `lib/alerts.ts` 的 `alertForAudit()`，新增敏感操作时顺带加上）；推送实现在 `lib/alert-transport.mjs`（纯 JS，`scripts/backup.mjs`、`scripts/site-update.mjs` 也直接用它）。配置存 `Setting` 表 key=`alerts`，与公开站点设置分开，密钥不回显到页面；浏览器端只能引用 `lib/alert-channels.mjs`。推送在请求内读配置、网络发送放后台，失败不影响业务。备份过期检查由 `instrumentation.ts` 启动的定时器执行（`lib/backup-watch.ts`），定时器里不能用依赖 Next 缓存的 `getSettings()`
- **依赖覆盖**：`package.json` 的 `overrides` 把 Prisma CLI 依赖的 `effect` 固定到 3.22.4（3.22.0 及以下有 ReDoS 公告，CI 的依赖审计会失败）；Prisma 自己升级到不再依赖旧版 effect 后可以删掉
- **给 Tutorial 表加字段**：迁移里只用 `ALTER TABLE "Tutorial" ADD COLUMN …`（外键列也可以 `ADD COLUMN … REFERENCES`），不要用 Prisma 自动生成的「RedefineTables」（新建表→拷数据→删旧表），那样会把 `TutorialSearch` 的三个触发器一起删掉，全文搜索从此不再更新。写完用 `prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma` 确认除 FTS 表外没有差异
- **Prisma 7**：schema 里 datasource **不能写 url**，连接串在 `prisma.config.ts`；客户端用 `new PrismaClient({ adapter: new PrismaBetterSqlite3({ url }) })`（`lib/prisma.ts`），生成代码在 `generated/prisma/`；生产环境启动时设 `journal_mode=WAL` + `synchronous=NORMAL`（同步驱动的每次 fsync 都会卡住整个进程），数据库文件旁会有 `-wal`/`-shm`，**不要直接复制 `.db` 文件做备份**，用 `npm run backup`（在线备份 API）。**WAL 下 Prisma 迁移（`migrate deploy/dev`）要求没有其他进程连着数据库**（迁移引擎会设 `locking_mode=EXCLUSIVE`，否则报 database is locked）：`deploy.sh` 在站点运行时先对快照迁移+构建、最后短暂停站迁移正式库，一键更新同样停站后迁移；开发环境用默认回滚日志模式，`npm run dev` 运行时也能 `prisma migrate dev`
- **Next 16 async APIs**：`cookies()`/`headers()`/`params`/`searchParams` 全部要 `await`；**动态路由 params 不会自动 URL 解码，含中文 slug 必须 `decodeURIComponent()`**
- **内容流**：Tiptap 产 HTML → `sanitizeArticleHtml()`（`lib/sanitize.ts`，入库和渲染各过滤一次）→ 前台 `lib/article.ts` 服务端提取 TOC + highlight.js 高亮 → `dangerouslySetInnerHTML` 渲染。新增编辑器扩展时同步放宽白名单
- **封面与缩略图**：`Tutorial.cover` 是后台上传的封面（只接受 `/uploads/` 下真实存在的文件），文章页头图、OG、JSON-LD 优先用它；`Tutorial.thumbnail` 是保存时算出的列表缩略图（封面，否则正文第一张上传图，优先 400w 小图，见 `lib/article.ts` 的 `thumbnailFor()`），旧数据由 `instrumentation.ts` 启动时补（`lib/thumbnail-backfill.ts`，用原生 SQL 不动 updatedAt）。列表查询只 select `thumbnail`，不要为了缩略图去读 content
- **标签**：`Tag` + `TutorialTag`（带 `position` 保持作者顺序），名称规整与别名在 `lib/tags.ts`（`tagSlug()`：C++→c-plus-plus），保存教程时 `lib/tag-sync.ts` 的 `setTutorialTags()` 按别名复用已有标签；前台 `/tags`、`/tags/[slug]`（数据走 `getPublishedTags()`/`getTagTutorialPage()`，缓存标签 `CACHE_TAGS.tags`），只有 1 篇已发布教程的标签页 `noindex` 且不进 sitemap；相关教程先按共同标签数排序。后台 `/admin/tags` 改名到已有名字即合并（`lib/actions/tags.ts`），改名/删除要刷新所有带该标签的文章页
- **关于页**：内容存 `Setting` key=`about`（`lib/about.ts`），后台 `/admin/about` 复用正文编辑器与白名单，正文为空时 `/about` 404 且不进 sitemap
- **文章分享图**：没有封面时 OG/Twitter/JSON-LD 用 `/og/tutorials/<id>?v=<内容哈希>`（`lib/share-image.ts` 算地址，`lib/share-image-render.tsx` 用 next/og 绘制，结果按版本在内存缓存）。字体是打包在 `assets/fonts/` 的思源黑体 GB2312 子集；**只绘制字体里有的字符**（`lib/font-coverage.ts` 读 cmap），否则 next/og 会去 Google Fonts/jsDelivr 下载补字，国内服务器会卡住。改模板时把 `TEMPLATE_VERSION` 加一
- **Next 数据缓存的已知限制**：`revalidateTag/revalidatePath` 的失效记录只存在当前进程内存里，进程重启后磁盘上的缓存页/数据缓存会按各自的 revalidate 时间才刷新，所以 `deploy.sh` 构建前会清掉 `.next/cache/fetch-cache`
- **编辑器**：表格是基于 `@tiptap/pm/tables` 的自写扩展（`components/editor/table.ts`，没装 @tiptap/extension-table：它的 peer 版本和已装的 Tiptap 对不上），代码块语言表在 `lib/code-languages.ts`（与文章页标签共用）。工具栏按选区显示表格/代码语言按钮，所以 `onSelectionUpdate` 会触发重渲染
- **本地草稿**：教程表单每 3 秒把字段快照存到 localStorage（`app/admin/(panel)/tutorials/use-draft.ts`），和服务器版本不同就保存；保存成功后 action 跳到 `/admin/tutorials?saved=<key>`，列表页据此清除草稿。改表单字段时同步 `use-draft.ts` 的 FIELDS 和 `tutorial-form.tsx` 的 `toDraft()`
- **历史版本 / 预览 / 定时发布**：`updateTutorial` 内容有变时先 `saveRevision()`（`lib/revisions.ts`，每篇最多 30 个），`/admin/tutorials/[id]/revisions` 查看和恢复；`/admin/preview/[id]` 预览已保存内容（含草稿）。`Tutorial.publishAt` 到点由 `lib/scheduled-publish.ts` 的定时器发布：定时器在请求外，不能 revalidateTag，所以带进程内随机口令请求本机 `/api/internal/publish-due` 去发布并刷新缓存。教程变动后的前台缓存刷新统一用 `lib/revalidate-public.ts`
- **教程系列**：`Series` + `Tutorial.seriesId/seriesOrder`（纯函数在 `lib/series.ts`，后台 `/admin/series` 与 `lib/actions/series.ts`）。前台数据统一走 `lib/public-data.ts` 的 `getPublishedSeries()`（一次取出所有有已发布教程的系列，带缓存标签 `CACHE_TAGS.series` + `tutorials`），系列页 `/series/[slug]` 是 ISR；文章页属于系列时显示 `components/series-box.tsx`，上一篇/下一篇改为系列内顺序，JSON-LD 带 `isPartOf`。调整顺序、加入/移出系列用原生 SQL（不刷新 updatedAt）。`revalidatePublic()` 会 `revalidatePath("/series/[slug]", "page")` 失效全部系列页（包括缓存下来的 404）。只有一篇的系列页 noindex 且不进 sitemap
- **阅读统计与反馈**：`lib/view-counter.ts` 批量写库时同时累加 `TutorialDailyView`（按北京时间的日期，`lib/site-day.ts`；保留约 400 天），仪表盘的趋势图（`app/admin/(panel)/view-trend.tsx`，单序列折线 + 悬停/方向键查看 + 数据表）和热门教程来自 `lib/view-stats.ts`。文末「有帮助吗」由 `components/helpful-feedback.tsx` 发到 `POST /api/feedback`（同源检查、按 IP+篇去重、每篇每小时上限），计数在 `Tutorial.helpfulYes/helpfulNo`，同样只用原生 SQL 自增；展示格式在 `lib/feedback.ts`（少于 5 票只显示票数）
- **文章页阅读辅助**：`components/reading-progress.tsx`（顶部进度条按 `.article-body` 计算 + 右下角回到顶部，隐藏时用 `inert`，回到顶部后焦点移到 `#main`）
- **搜索**：≥3 个字走 FTS5 trigram（`TutorialSearch`，SQL 触发器维护）；1–2 个字查标题摘要 + 中文两两切词索引 `TutorialBigram`（`lib/search-index.ts`，应用维护：启动和每次 `revalidatePublic()` 时按 updatedAt 增量同步）；标签名完全相同的教程排在最前。摘要里看不到关键词的结果，再用 `instr` 取关键词前后一段正文做摘要（`lib/search.ts` 的 `refineSnippets()`，纯函数在 `lib/search-snippet.ts`，只对最终 ≤20 条结果查询）
- **正文提示框**：`components/editor/callout.ts`（Tiptap 节点，`<div data-callout="tip|warning|danger">`），类型表在 `lib/callouts.ts`，白名单在 `lib/sanitize.ts` 的 `transformTags.div`，标签文字/配色在 `globals.css`
- **精简模式**：根布局内联脚本在省流量、内存 < 4GB、CPU < 4 核或系统要求减少透明效果时给 `<html>` 加 `data-lite`；`globals.css` 据此关掉 backdrop-filter、`blur-3xl` 光晕和循环动画，`pointer-aura` 也不启动。新增毛玻璃/循环动画时确认精简模式下能关掉
- **图片上传**：编辑器拖拽/粘贴 → `POST /api/upload`（鉴权 + 文件头识别 PNG/JPG/GIF/WebP + 5MB；不接受 SVG）→ sharp 缩放到 1600px 宽、转 WebP、去 EXIF（GIF 原样）→ 存 `public/uploads/`，宽图另存 `-400w`/`-800w`/`-1200w.webp` 响应式小图（命名在 `lib/image-variants.ts`），`lib/article.ts` 渲染时自动加 `srcset`/`sizes`；旧图用 `npm run images:variants` 补生成。`next start` 只在启动时扫描 public，启动后新增的文件由 `app/uploads/[name]/route.ts` 兜底提供
- **安全响应头**：CSP/HSTS/nosniff 等统一在 `next.config.ts` 的 `headers()`；HSTS 只在 `X-Forwarded-Proto: https` 时下发，`/uploads/*` 带 `sandbox` CSP
- 后台结构：`app/admin/login`（登录页）+ `app/admin/(panel)/*`（带侧边栏的面板路由组）
- **前台链接**：一律用 `components/intent-link.tsx`（悬停/触摸/聚焦时才预取），不要直接用 `next/link`，否则每个页面会对视口内所有链接发预取请求
- **文章页是 ISR 缓存页**（`revalidate = 60` + 空 `generateStaticParams`；首页同为 60 秒：重新生成若恰好跨过后台修改会存下旧内容，周期短可让它很快自愈，所以别调大；后台指向前台的链接一律 `prefetch={false}`，免得后台页面加载就触发前台重新生成）：页面里不能用 `headers()`/`cookies()`/`after()`，否则整页退回动态渲染；阅读量由 `components/view-beacon.tsx` 上报到 `POST /api/views`。改教程时 `lib/actions/tutorials.ts` 的 `revalidatePublic()` 要把**旧 slug 和新 slug** 都传进去（中文 slug 的原文和编码形式都会失效）
- **SEO**：文章页底部「相关教程」来自 `lib/public-data.ts` 的 `getRelatedTutorialCandidates()`（先按共同标签数，再同分类按阅读量，不够再从父/子/同父分类补，顶级分类之间不算相关）。可收录页面的 metadata 一律用 `lib/seo.ts` 的 `pageMetadata()` 生成——各层 metadata 是浅合并，子页面一写 `openGraph`/`alternates` 就会整个替换根布局的（RSS 链接、站点名、分享图都会丢），所以要给全字段；**根布局不能写 canonical**（否则搜索/404 页都被规范到首页）。分页列表规范地址带 `?page=N`（第 1 页不带）。结构化数据用 `components/json-ld.tsx`；搜索页 `noindex, follow` 且不进 sitemap。阅读量用原生 SQL 自增（`lib/view-counter.ts`），不能改回 `prisma.tutorial.update`，否则每次阅读都会刷新 `updatedAt`，sitemap lastmod 与 `article:modified_time` 失真
- **前台数据缓存**：分类、设置、教程列表经 `unstable_cache` 缓存（`lib/public-data.ts` 的 `CACHE_TAGS`）；后台改动后在 Server Action 里 `revalidateTag(tag, { expire: 0 })`。缓存以 JSON 存储，Date 需自行还原
- **动效与首屏**：首屏最大的元素（首页大标题、文章标题/正文）用 `<Reveal fade={false}>` 只做位移，避免从透明淡入拖慢 LCP；桌面导航 hydration 前用 CSS 断点渲染三档分页，避免跳动
- **颜色对比度**：辅助文字 `text-ink-3`（#6b7280）、小号强调文字用 `text-accent-ink`（#4f46e5），`text-accent` 只用于大字号、图标和背景。分类颜色是后台随意填的，用作小字时一律加 `cat-text` 类 + `style={categoryTextStyle(color)}`（`lib/color.ts` 按亮/暗背景各算一个达到 4.5:1 的变体），不要直接 `style={{ color }}`
- **正文交互**：文章 HTML 是服务端生成的静态内容（标题 ID 按文字生成，见 `headingSlug()`；代码块带语言标签和复制按钮），交互由 `components/article-enhancer.tsx` 事件委托接管（复制代码、`#` 复制章节链接、图片放大、旧 `#h-N` 链接兼容）。打印样式在 `globals.css` 的 `@media print`，站点外框元素加 `print-hide` 类
- **原生 checkbox 驱动的开关**（移动端抽屉、本页目录）：hydration 前也能点开，用 `components/label-button.tsx`（label 不能带 ARIA role，按钮语义放在内层 span 上），CSS 选择器写成 `.xxx-toggle:checked + label .xxx-trigger`
- **站点设置**：`Setting` 表（key-value，单行 key=`site`，JSON 存全部设置）；类型/默认值/读取在 `lib/settings.ts`（`getSettings()` 自动回退默认值）；后台编辑在 `/admin/settings`（底部栏目是客户端 JSON 编辑器，`autoCategories: true` 的栏目自动输出分类链接；「搜索引擎验证」的平台列表、验证码校验与 meta 输出在 `lib/search-verification.ts`，根布局输出到每个页面；「安全联系方式」生成 `app/.well-known/security.txt/route.ts`，留空返回 404）；前台 layout/页脚/首页 Hero 均从 `getSettings()` 取数
- **后台表单**：React 19 的 `<form action={…}>` 在 action 结束后会重置表单，服务端校验失败时已填内容会丢失；成功后跳转、或成功后就该保留当前值的表单用 `lib/form-submit.ts` 的 `submitKeepingValues()`（设置页、教程编辑页已改）
- Server Actions 在 `lib/actions/`，每个都必须 `requireAuth()`；变更后 `revalidatePath`。`"use server"` 文件里导出的每个函数都会成为可被直接调用的接口，辅助函数放到普通模块中

## 默认账号
- 后台 `/admin`：开发环境 `admin / admin123456`；生产环境未设置 `ADMIN_PASSWORD` 时 seed 会随机生成密码并打印。务必设置随机 `AUTH_SECRET`

## 设计风格
- 极简白（#f7f8fa 底 + 白卡片 + 1px #e9ebf0 边）+ 靛蓝 #6366f1 点缀
- 参考 vps.sbai.shop：悬浮胶囊导航（激活项 aura+shine 动效）、鼠标跟随小幽灵吉祥物、glow-card 聚光灯+3D 倾斜
