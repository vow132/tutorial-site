import bcrypt from "bcryptjs";
import { PrismaClient } from "../generated/prisma/client";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { getDatabaseUrl } from "../lib/database-url";

const adapter = new PrismaBetterSqlite3({ url: getDatabaseUrl(), timeout: 5000 });
const prisma = new PrismaClient({ adapter });
async function main() {
  // 管理员：只在全新数据库中写入一次。之后账号由后台“账号安全”页面管理，
  // 避免每次部署因用户名已修改而重新创建一个默认 admin。
  const existingAdmin = await prisma.admin.findFirst({ select: { id: true } });
  if (!existingAdmin) {
    const username = process.env.ADMIN_USERNAME ?? "admin";
    const password = process.env.ADMIN_PASSWORD ?? "admin123456";
    await prisma.admin.create({
      data: { username, password: bcrypt.hashSync(password, 10) },
    });
  }

  // 分类
  const categories = [
    { name: "前端开发", slug: "frontend", icon: "🎨", color: "#6366f1", order: 1, description: "HTML、CSS、JavaScript 与现代框架" },
    { name: "后端开发", slug: "backend", icon: "⚙️", color: "#0ea5e9", order: 2, description: "Node.js、API 设计与服务端架构" },
    { name: "数据库", slug: "database", icon: "🗄️", color: "#10b981", order: 3, description: "SQL、建模与性能优化" },
    { name: "运维部署", slug: "devops", icon: "🚀", color: "#f59e0b", order: 4, description: "Linux、Docker 与 CI/CD" },
    { name: "设计基础", slug: "design", icon: "✏️", color: "#ec4899", order: 5, description: "排版、色彩与交互设计原理" },
  ];
  for (const c of categories) {
    await prisma.category.upsert({ where: { slug: c.slug }, update: {}, create: c });
  }

  const frontend = await prisma.category.findUnique({ where: { slug: "frontend" } });
  const backend = await prisma.category.findUnique({ where: { slug: "backend" } });

  const tutorials = [
    {
      title: "CSS Flexbox 布局完全指南",
      slug: "css-flexbox-guide",
      categoryId: frontend!.id,
      excerpt: "从主轴与交叉轴开始，系统掌握 Flexbox 的所有核心属性，并用三个实战案例巩固。",
      published: true,
      views: 328,
      content: `
<h2>为什么需要 Flexbox</h2>
<p>在 Flexbox 出现之前，垂直居中、等高列、自适应栅格都需要各种 hack。Flexbox 用一套一维布局模型统一解决了这些问题。</p>
<h2>容器与项目</h2>
<p>给父元素设置 <code>display: flex</code> 后，它就成为了<strong>弹性容器</strong>，直接子元素自动成为<strong>弹性项目</strong>。</p>
<pre><code class="language-css">.container {
  display: flex;
  justify-content: center; /* 主轴对齐 */
  align-items: center;     /* 交叉轴对齐 */
  gap: 16px;               /* 项目间距 */
}</code></pre>
<h2>核心概念：两根轴</h2>
<ul>
<li><strong>主轴（main axis）</strong>：由 <code>flex-direction</code> 决定，默认为水平方向</li>
<li><strong>交叉轴（cross axis）</strong>：与主轴垂直</li>
</ul>
<blockquote><p>记住：所有 <code>justify-*</code> 属性作用于主轴，所有 <code>align-*</code> 属性作用于交叉轴。</p></blockquote>
<h2>实战：三栏等高卡片</h2>
<pre><code class="language-css">.cards {
  display: flex;
  gap: 24px;
}
.card {
  flex: 1;          /* 等分剩余空间 */
  min-width: 0;     /* 防止内容撑破 */
}</code></pre>
<h2>常见坑</h2>
<ol>
<li>文本溢出：给项目加 <code>min-width: 0</code></li>
<li>justify-content 无效：检查主轴方向与剩余空间</li>
<li>嵌套过深：一层 flex 解决不了的，考虑 Grid</li>
</ol>
<p>掌握这些，你已经能完成 80% 的日常布局。</p>`,
    },
    {
      title: "Node.js 读写文件的三种姿势",
      slug: "nodejs-file-io",
      categoryId: backend!.id,
      excerpt: "回调、Promise、流式处理——搞懂 Node.js 文件 API 的演进与各自的适用场景。",
      published: true,
      views: 256,
      content: `
<h2>一、同步 API：简单但会阻塞</h2>
<pre><code class="language-js">const fs = require('node:fs');
const data = fs.readFileSync('./config.json', 'utf8');</code></pre>
<p>适合 CLI 脚本和启动阶段加载配置，<strong>绝不要</strong>用在请求处理链路中。</p>
<h2>二、Promise API：日常首选</h2>
<pre><code class="language-js">import { readFile, writeFile } from 'node:fs/promises';

const content = await readFile('./a.txt', 'utf8');
await writeFile('./b.txt', content);</code></pre>
<h2>三、流（Stream）：大文件必备</h2>
<p>一次性读取 10GB 日志文件会直接爆内存，流式处理才是正解：</p>
<pre><code class="language-js">import { createReadStream, createWriteStream } from 'node:fs';
import { pipeline } from 'node:stream/promises';

await pipeline(
  createReadStream('./big.log'),
  createWriteStream('./big-copy.log')
);</code></pre>
<blockquote><p>经验法则：文件超过 100MB 或需要边读边处理时，一律使用 Stream。</p></blockquote>
<h2>如何选择</h2>
<ul>
<li>脚本 / 启动配置 → 同步 API</li>
<li>普通业务读写 → Promise API</li>
<li>大文件 / 网络转发 → Stream</li>
</ul>`,
    },
    {
      title: "五分钟理解 HTTP 缓存",
      slug: "http-cache-in-5-min",
      categoryId: frontend!.id,
      excerpt: "强缓存与协商缓存到底怎么走？一张流程图加可运行的示例代码讲清楚。",
      published: true,
      views: 189,
      content: `
<h2>缓存的两个阶段</h2>
<p>浏览器请求资源时，先问<strong>强缓存</strong>，过期后再问<strong>协商缓存</strong>。</p>
<h2>强缓存：不发请求</h2>
<pre><code class="language-txt">Cache-Control: max-age=31536000, immutable</code></pre>
<p>命中时直接读本地，状态码 <code>200 (from disk cache)</code>。带 hash 的静态资源（如 <code>app.a1b2c3.js</code>）适合一年长缓存。</p>
<h2>协商缓存：发请求但可能不传 body</h2>
<p>强缓存过期后，浏览器带上 <code>If-None-Match</code>（对应 ETag）询问服务器：</p>
<ul>
<li>内容没变 → 返回 <code>304 Not Modified</code>，无响应体</li>
<li>内容变了 → 返回 <code>200</code> 和新内容</li>
</ul>
<h2>最佳实践</h2>
<ol>
<li>HTML：<code>Cache-Control: no-cache</code>，每次都协商</li>
<li>带指纹的 JS/CSS/图片：<code>max-age=31536000, immutable</code></li>
<li>API 响应：谨慎缓存，必须时配合 ETag</li>
</ol>
<blockquote><p>口诀：<strong>HTML 不缓存，静态资源永缓存，变化资源走协商</strong>。</p></blockquote>`,
    },
  ];

  for (const t of tutorials) {
    await prisma.tutorial.upsert({
      where: { slug: t.slug },
      update: {},
      create: { ...t, content: t.content.trim() },
    });
  }

  console.log("✅ 种子数据写入完成");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
