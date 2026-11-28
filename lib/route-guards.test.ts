import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import ts from "typescript";

/*
 * proxy.ts 只验 Cookie 签名、不查库：会话有没有被吊销、角色有没有权限，全靠每个后台页面、接口和
 * Server Action 自己调用检查函数。这个测试扫描源码，保证没有哪个入口漏掉：
 *
 * - 后台页面（app/admin/**\/page.tsx）：调用 requireAdminPage()（账号安全页用 getCurrentSession()）；
 * - 接口（app/**\/route.ts）：每个导出的 GET/POST… 调用 getCurrentAdmin() 等检查函数；
 * - Server Action（"use server" 文件）：每个导出的函数调用 requireAuth() / requireSession()。
 *
 * 不需要登录的入口必须列在下面的白名单里并写明原因。新加入口时：要么调用检查函数，要么加进白名单。
 */

const root = path.resolve(import.meta.dirname, "..");

const PUBLIC_ADMIN_PAGES: Record<string, string> = {
  "app/admin/login/page.tsx": "登录页",
  "app/admin/setup/page.tsx": "首次安装页：页面自己判断已有账号时跳登录页，提交时校验安装码",
};

const PUBLIC_ROUTES: Record<string, string> = {
  "app/.well-known/security.txt/route.ts": "安全联系方式（公开信息）",
  "app/api/feedback/route.ts": "读者「有帮助吗」：同源检查 + 按 IP 去重限流",
  "app/api/feedback/message/route.ts": "读者留言：同源检查 + 限流，只收已发布教程",
  "app/api/health/route.ts": "健康检查：不含敏感信息",
  "app/api/internal/publish-due/route.ts": "定时发布：只认本进程内的随机口令（x-scheduler-token）",
  "app/api/subscribe/route.ts": "邮件订阅：同源检查 + 限流",
  "app/api/subscribe/confirm/route.ts": "确认订阅：凭 HMAC 签名链接",
  "app/api/unsubscribe/route.ts": "退订：凭 HMAC 签名链接",
  "app/api/views/route.ts": "阅读统计上报",
  "app/brand/icon/route.ts": "网站图标",
  "app/comments/frame/route.ts": "评论区小页面：只给已发布教程输出所选第三方评论服务的嵌入代码",
  "app/favicon.ico/route.ts": "网站图标",
  "app/feed.xml/route.ts": "RSS，只含已发布教程",
  "app/og/site/route.ts": "默认分享图",
  "app/og/tutorials/[id]/route.ts": "文章分享图，只画已发布教程",
  "app/uploads/[name]/route.ts": "上传的图片（公开资源）",
};

const PUBLIC_ACTIONS: Record<string, string> = {
  "lib/actions/auth.ts#login": "登录本身（带限流）",
  "lib/actions/auth.ts#logout": "退出当前会话",
  "lib/actions/passkeys.ts#beginPasskeyLogin": "通行密钥登录第一步（带限流）",
  "lib/actions/passkeys.ts#finishPasskeyLogin": "通行密钥登录第二步（带限流，挑战只能用一次）",
  "lib/actions/setup.ts#completeSetup": "首次安装：没有任何账号时才可用，校验安装码并限流",
  "lib/actions/locale.ts#setAdminLocale": "只写界面语言的 Cookie（登录页、安装页也要能切换），值限定为支持的语言",
};

const PAGE_GUARD = /\b(requireAdminPage|getCurrentSession)\(/;
const ROUTE_GUARD = /\b(requireAdminPage|requireAuth|requireSession|getCurrentAdmin|getCurrentSession)\(/;
const ACTION_GUARD = /\b(requireAuth|requireSession)\(/;
const HTTP_METHODS = new Set(["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"]);

function walk(dir: string): string[] {
  return readdirSync(path.join(root, dir), { withFileTypes: true }).flatMap((entry) => {
    const rel = `${dir}/${entry.name}`;
    if (entry.isDirectory()) return entry.name === "node_modules" ? [] : walk(rel);
    return /\.(ts|tsx)$/.test(entry.name) ? [rel] : [];
  });
}

const sourceFiles = [...walk("app"), ...walk("lib"), ...walk("components")].filter((file) => !file.endsWith(".test.ts"));

function parse(file: string) {
  return ts.createSourceFile(file, readFileSync(path.join(root, file), "utf8"), ts.ScriptTarget.Latest, true);
}

/** 文件里导出的函数：名字和函数体源码。`export const x = async () => {}` 这种写法一并算上。 */
function exportedFunctions(source: ts.SourceFile) {
  const result: { name: string; body: string }[] = [];
  const exported = (node: ts.Node) =>
    ts.canHaveModifiers(node) && (ts.getModifiers(node) ?? []).some((m) => m.kind === ts.SyntaxKind.ExportKeyword);
  for (const statement of source.statements) {
    if (ts.isFunctionDeclaration(statement) && exported(statement) && statement.name) {
      result.push({ name: statement.name.text, body: statement.body?.getText(source) ?? "" });
    } else if (ts.isVariableStatement(statement) && exported(statement)) {
      for (const declaration of statement.declarationList.declarations) {
        const init = declaration.initializer;
        if (init && (ts.isArrowFunction(init) || ts.isFunctionExpression(init)) && ts.isIdentifier(declaration.name)) {
          result.push({ name: declaration.name.text, body: init.body.getText(source) });
        }
      }
    }
  }
  return result;
}

function hasUseServerDirective(source: ts.SourceFile) {
  const first = source.statements[0];
  return !!first && ts.isExpressionStatement(first) && ts.isStringLiteral(first.expression) && first.expression.text === "use server";
}

test("every admin page checks the session and role itself", () => {
  const pages = sourceFiles.filter((file) => /^app\/admin\/.*\/page\.tsx$/.test(file));
  assert.ok(pages.length > 10, "found the admin pages");
  const missing = pages.filter((file) => !PUBLIC_ADMIN_PAGES[file] && !PAGE_GUARD.test(readFileSync(path.join(root, file), "utf8")));
  assert.deepEqual(missing, [], "these admin pages must call requireAdminPage() (or be listed in PUBLIC_ADMIN_PAGES)");
});

test("every route handler checks the session, unless it is a listed public endpoint", () => {
  const routes = sourceFiles.filter((file) => /^app\/.*\/route\.tsx?$/.test(file));
  assert.ok(routes.length > 10, "found the route handlers");
  const missing: string[] = [];
  for (const file of routes) {
    if (PUBLIC_ROUTES[file]) {
      assert.ok(!file.startsWith("app/admin/") && !file.startsWith("app/api/admin/"), `${file} is under an admin path and cannot be public`);
      continue;
    }
    for (const fn of exportedFunctions(parse(file))) {
      if (HTTP_METHODS.has(fn.name) && !ROUTE_GUARD.test(fn.body)) missing.push(`${file} ${fn.name}`);
    }
  }
  assert.deepEqual(missing, [], "these handlers must check the session (or the file must be listed in PUBLIC_ROUTES)");
});

test("every server action checks the session and role itself", () => {
  const actionFiles = sourceFiles.filter((file) => hasUseServerDirective(parse(file)));
  assert.ok(actionFiles.length > 10, "found the server action files");
  const missing: string[] = [];
  for (const file of actionFiles) {
    for (const fn of exportedFunctions(parse(file))) {
      if (!PUBLIC_ACTIONS[`${file}#${fn.name}`] && !ACTION_GUARD.test(fn.body)) missing.push(`${file}#${fn.name}`);
    }
  }
  assert.deepEqual(missing, [], "these server actions must call requireAuth() / requireSession() (or be listed in PUBLIC_ACTIONS)");
});

test("server actions are only defined in 'use server' files (no inline actions the scan would miss)", () => {
  const inline = sourceFiles.filter((file) => {
    const source = parse(file);
    if (hasUseServerDirective(source)) return false;
    return /["']use server["']/.test(source.getFullText());
  });
  assert.deepEqual(inline, [], "move inline 'use server' functions into lib/actions/");
});

test("the public allowlists only name entry points that exist", () => {
  for (const file of [...Object.keys(PUBLIC_ADMIN_PAGES), ...Object.keys(PUBLIC_ROUTES)]) {
    assert.ok(existsSync(path.join(root, file)), `${file} no longer exists; remove it from the allowlist`);
  }
  for (const key of Object.keys(PUBLIC_ACTIONS)) {
    const [file, name] = key.split("#");
    assert.ok(exportedFunctions(parse(file)).some((fn) => fn.name === name), `${key} no longer exists; remove it from the allowlist`);
  }
});
