/**
 * 应急恢复：忘记密码或丢失两步验证手机时，在服务器上运行
 *   npm run admin:reset                     # 随机生成新密码
 *   npm run admin:reset -- --password '新密码' --username admin
 * 会重置密码、关闭两步验证并吊销该管理员的所有登录会话。
 */
import { randomBytes } from "node:crypto";
import { parseArgs } from "node:util";
import bcrypt from "bcryptjs";
import { config as loadEnv } from "dotenv";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { PrismaClient } from "../generated/prisma/client";
import { getDatabaseUrl } from "../lib/database-url";
import { passwordProblem } from "../lib/password-policy";

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
  const admin = values.username
    ? await prisma.admin.findUnique({ where: { username: values.username } })
    : await prisma.admin.findFirst({ orderBy: { id: "asc" } });
  if (!admin) throw new Error("找不到管理员账号，请检查 --username 或先运行 npx prisma db seed");

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
    prisma.auditLog.create({
      data: { action: "account.reset_cli", actor: admin.username, detail: "服务器命令行重置密码并关闭两步验证" },
    }),
  ]);

  console.log(`✅ 已重置管理员 ${admin.username}`);
  if (!values.password) console.log(`   新密码：${password}`);
  console.log("   两步验证已关闭，所有已登录设备已退出。登录后请立即修改密码并重新开启两步验证。");
}

main()
  .catch((error) => {
    console.error(`❌ ${error instanceof Error ? error.message : error}`);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
