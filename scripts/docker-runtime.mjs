#!/usr/bin/env node
/**
 * Docker 构建用：把 `BUILD_STANDALONE=1 npm run build` 的 standalone 输出整理成镜像里的 /app。
 *
 * standalone 只带网站运行实际用到的文件（Next 静态分析出来的；普通的 npm 包已经打包进服务端代码，
 * node_modules 里只剩原生模块等少数几个），没有 Prisma 命令行、构建工具和只在浏览器里用的包，镜像因此小一大半。
 * 这里再补上：
 * - 静态资源（.next/static、public）；
 * - 启动和运维命令：scripts/*.mjs、它们引用的 lib/*.mjs、数据库迁移文件（迁移用 scripts/migrate.mjs，不需要 Prisma 命令行）；
 * - 用 TypeScript 写的种子数据、管理员重置、补生成小图三个脚本，用 esbuild 打包成单个 .mjs
 *   （镜像里没有 tsx，standalone 的 node_modules 里也没有 bcryptjs 这些包），package.json 的命令改为运行打包后的文件；
 * - .mjs 脚本要用的 dotenv。
 *
 * 用法：node scripts/docker-runtime.mjs <目标目录>
 */
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";

const require = createRequire(import.meta.url);
const root = process.cwd();
const target = process.argv[2] ? path.resolve(process.argv[2]) : "";
const standalone = path.join(root, ".next", "standalone");
if (!target) {
  console.error("用法：node scripts/docker-runtime.mjs <目标目录>");
  process.exit(1);
}
if (!existsSync(path.join(standalone, "server.js"))) {
  console.error("没有找到 .next/standalone/server.js：请先用 BUILD_STANDALONE=1 npm run build 构建");
  process.exit(1);
}

/** 打包成 scripts/<名字>.mjs 的 TypeScript 脚本。 */
const BUNDLES = {
  seed: "prisma/seed.ts",
  "reset-admin": "scripts/reset-admin.ts",
  "image-variants": "scripts/image-variants.ts",
};
/** 镜像里 package.json 的命令（npm run …），和源码里的同名命令做同样的事。 */
const SCRIPTS = {
  backup: "node scripts/backup.mjs",
  "backup:restore": "node scripts/backup-restore.mjs",
  "uploads:clean": "node scripts/uploads-clean.mjs",
  "admin:reset": "node scripts/reset-admin.mjs",
  "images:variants": "node scripts/image-variants.mjs",
  migrate: "node scripts/migrate.mjs",
};

const notTest = (source) => !/\.test\.m?[jt]s$/.test(source);
const copy = (from, to = from, filter = notTest) =>
  cpSync(path.join(root, from), path.join(target, to), { recursive: true, force: true, filter });
/** 不一定存在的目录（例如 public：仓库里目前没有要跟踪的文件，干净的检出里就没有它；上传目录由 Dockerfile 建）。 */
const copyIfExists = (from) => existsSync(path.join(root, from)) && copy(from);

rmSync(target, { recursive: true, force: true });
cpSync(standalone, target, { recursive: true, verbatimSymlinks: true });
cpSync(path.join(root, ".next", "static"), path.join(target, ".next", "static"), { recursive: true });
copyIfExists("public");
copyIfExists("assets");
copy("prisma/migrations");
for (const dir of ["scripts", "lib"]) {
  mkdirSync(path.join(target, dir), { recursive: true });
  for (const name of readdirSync(path.join(root, dir))) {
    if (name.endsWith(".mjs") && notTest(name)) copy(`${dir}/${name}`);
  }
}
copy("node_modules/dotenv");

// 镜像是 glibc 系统：standalone 可能把 musl 版的原生包也带上了
const nodeModules = path.join(target, "node_modules");
for (const scope of ["@img", "@next"]) {
  const dir = path.join(nodeModules, scope);
  if (!existsSync(dir)) continue;
  for (const name of readdirSync(dir)) {
    if (name.includes("musl") || name.startsWith("swc-")) rmSync(path.join(dir, name), { recursive: true, force: true });
  }
}

// 镜像里已有的包（原生模块、Prisma 运行时等）保持外部引用，其余的打包进脚本
const installed = readdirSync(nodeModules).flatMap((name) =>
  name.startsWith("@") ? readdirSync(path.join(nodeModules, name)).map((sub) => `${name}/${sub}`) : name.startsWith(".") ? [] : [name],
);
const esbuild = require("esbuild");
for (const [name, entry] of Object.entries(BUNDLES)) {
  esbuild.buildSync({
    entryPoints: [path.join(root, entry)],
    outfile: path.join(target, "scripts", `${name}.mjs`),
    bundle: true,
    platform: "node",
    format: "esm",
    target: "node22",
    external: installed.flatMap((pkg) => [pkg, `${pkg}/*`]),
    // 打包进来的 CommonJS 包（bcryptjs、dotenv）在 ESM 里要用 require
    banner: { js: 'import { createRequire as __createRequire } from "node:module"; const require = __createRequire(import.meta.url);' },
    logLevel: "warning",
  });
}

const pkg = JSON.parse(readFileSync(path.join(root, "package.json"), "utf8"));
writeFileSync(
  path.join(target, "package.json"),
  `${JSON.stringify({ name: pkg.name, version: pkg.version, private: true, type: pkg.type, scripts: SCRIPTS }, null, 2)}\n`,
);
console.log(`✅ 镜像内容已整理到 ${target}`);
