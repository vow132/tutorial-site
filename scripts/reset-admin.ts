/**
 * 应急恢复：忘记密码或丢失两步验证手机时，在服务器上运行
 *   npm run admin:reset                     # 随机生成新密码
 *   npm run admin:reset -- --password '新密码' --username admin
 * 会重置密码、关闭两步验证（连同恢复码）、删除所有通行密钥并吊销该账号的所有登录会话
 * （账号可能已被人控制时，对方可能偷偷添加了通行密钥，必须一并清掉）。
 * 不指定 --username 时重置第一个站长；还没有任何账号（安装页面还没完成）时直接创建站长账号。
 */
import { randomBytes } from "node:crypto";
import { parseArgs } from "node:util";
import bcrypt from "bcryptjs";
import { config as loadEnv } from "dotenv";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { PrismaClient } from "../generated/prisma/client";
import { getDatabaseUrl } from "../lib/database-url";
import { passwordProblem } from "../lib/password-policy";
import { USERNAME_PATTERN } from "../lib/roles";

if (process.env.NODE_ENV === "production") loadEnv({ path: ".env.production", quiet: true });
loadEnv({ path: ".env", quiet: true });

const { values } = parseArgs({
  options: {
    username: { type: "string" },
    password: { type: "string" },
  },
});

const prisma = new PrismaClient({
  adapter: new PrismaBetterSqlite3({ url: getDatabaseUrl(), timeout: 5000 }),
});

async function main() {
  // 还没有任何账号：等于在命令行完成安装（创建站长），不用打开 /admin/setup
  if ((await prisma.admin.count()) === 0) {
    const username = values.username ?? "admin";
    if (!USERNAME_PATTERN.test(username)) throw new Error("用户名要 3-32 位字母、数字、下划线或连字符");
    const password = values.password ?? randomBytes(12).toString("base64url");
    const problem = values.password ? passwordProblem(password, username) : null;
    if (problem) throw new Error(problem);
    await prisma.admin.create({ data: { username, role: "owner", password: await bcrypt.hash(password, 12) } });
    await prisma.auditLog.create({ data: { action: "account.reset_cli", actor: username, detail: "服务器命令行创建站长账号" } });
    console.log(`✅ 已创建站长账号 ${username}`);
    if (!values.password) console.log(`   密码：${password}`);
    console.log("   登录后台后建议立即开启两步验证。");
    return;
  }

  const admin = values.username
    ? await prisma.admin.findUnique({ where: { username: values.username } })
    : ((await prisma.admin.findFirst({ where: { role: "owner" }, orderBy: { id: "asc" } })) ??
      (await prisma.admin.findFirst({ orderBy: { id: "asc" } })));
  if (!admin) throw new Error(`找不到账号 ${values.username}，请检查 --username`);

  const password = values.password ?? randomBytes(12).toString("base64url");
  const problem = values.password ? passwordProblem(password, admin.username) : null;
  if (problem) throw new Error(problem);

  await prisma.$transaction([
    prisma.admin.update({
      where: { id: admin.id },
      data: {
        password: await bcrypt.hash(password, 12),
        totpSecret: null,
        totpLastStep: null,
      },
    }),
    prisma.adminSession.deleteMany({ where: { adminId: admin.id } }),
    prisma.adminPasskey.deleteMany({ where: { adminId: admin.id } }),
    prisma.adminRecoveryCode.deleteMany({ where: { adminId: admin.id } }),
    prisma.auditLog.create({
      data: {
        action: "account.reset_cli",
        actor: admin.username,
        detail: "服务器命令行重置密码，关闭两步验证（含恢复码）并删除所有通行密钥",
      },
    }),
  ]);

  console.log(`✅ 已重置账号 ${admin.username}`);
  if (!values.password) console.log(`   新密码：${password}`);
  console.log("   两步验证已关闭、通行密钥已全部删除，所有已登录设备已退出。");
  console.log("   登录后请立即修改密码，并重新开启两步验证、重新添加通行密钥。");
}

main()
  .catch((error) => {
    console.error(`❌ ${error instanceof Error ? error.message : error}`);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
