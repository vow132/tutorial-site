/**
 * 应急恢复：忘记密码或丢失两步验证手机时，在服务器上运行
 *   npm run admin:reset                     # 随机生成新密码
 *   npm run admin:reset -- --password '新密码' --username admin
 * 会重置密码、关闭两步验证（连同恢复码）、删除所有通行密钥并吊销该账号的所有登录会话
 * （账号可能已被人控制时，对方可能偷偷添加了通行密钥，必须一并清掉）。开启了人机验证时一并关闭
 * （比如服务器或浏览器连不上 Cloudflare 导致谁都登录不了），密钥保留，登录后在站点设置里重新开启即可。
 * 不指定 --username 时重置第一个站长；还没有任何账号（安装页面还没完成）时直接创建站长账号；
 * 网站里一个站长都没有时（比如直接改过数据库），被重置的账号同时恢复为站长，保证总能拿回管理权限。
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
import { disabledStoredTurnstile, TURNSTILE_SETTING_KEY } from "../lib/turnstile";
import { admin as enAdmin } from "../lib/i18n/messages/en/admin";
import { cliText, localeFromSiteSetting } from "../lib/script-i18n.mjs";

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

/** 开启了人机验证时关掉它，返回是否关了。 */
async function disableTurnstile() {
  const row = await prisma.setting.findUnique({ where: { key: TURNSTILE_SETTING_KEY } });
  const value = disabledStoredTurnstile(row?.value);
  if (!row || value === null) return false;
  await prisma.setting.update({ where: { key: TURNSTILE_SETTING_KEY }, data: { value } });
  return true;
}

async function main() {
  // 输出和安全日志跟网站语言：中文站点中文，其余英文（还没装好的新库中英文都输出）
  const locale = localeFromSiteSetting((await prisma.setting.findUnique({ where: { key: "site" } }))?.value);
  const say = cliText(locale);
  const passwordText = locale && locale !== "zh-CN" ? enAdmin.password : undefined;
  // 还没有任何账号：等于在命令行完成安装（创建站长），不用打开 /admin/setup
  if ((await prisma.admin.count()) === 0) {
    const username = values.username ?? "admin";
    if (!USERNAME_PATTERN.test(username)) {
      throw new Error(say("用户名要 3-32 位字母、数字、下划线或连字符", "The username needs 3–32 letters, digits, underscores or hyphens"));
    }
    const password = values.password ?? randomBytes(12).toString("base64url");
    const problem = values.password ? passwordProblem(password, username, passwordText) : null;
    if (problem) throw new Error(problem);
    await prisma.admin.create({ data: { username, role: "owner", password: await bcrypt.hash(password, 12) } });
    await prisma.auditLog.create({ data: { action: "account.reset_cli", actor: username, detail: say("服务器命令行创建站长账号", "Owner account created from the server command line") } });
    console.log(say(`✅ 已创建站长账号 ${username}`, `✅ Owner account ${username} created`));
    if (!values.password) console.log(say(`   密码：${password}`, `   Password: ${password}`));
    console.log(say("   登录后台后建议立即开启两步验证。", "   Turn on two-factor authentication right after signing in."));
    return;
  }

  const admin = values.username
    ? await prisma.admin.findUnique({ where: { username: values.username } })
    : ((await prisma.admin.findFirst({ where: { role: "owner" }, orderBy: { id: "asc" } })) ??
      (await prisma.admin.findFirst({ orderBy: { id: "asc" } })));
  if (!admin) throw new Error(say(`找不到账号 ${values.username}，请检查 --username`, `No account named ${values.username}; check --username`));
  const promote = admin.role !== "owner" && (await prisma.admin.count({ where: { role: "owner" } })) === 0;

  const password = values.password ?? randomBytes(12).toString("base64url");
  const problem = values.password ? passwordProblem(password, admin.username, passwordText) : null;
  if (problem) throw new Error(problem);

  await prisma.$transaction([
    prisma.admin.update({
      where: { id: admin.id },
      data: {
        password: await bcrypt.hash(password, 12),
        totpSecret: null,
        totpLastStep: null,
        ...(promote ? { role: "owner" } : {}),
      },
    }),
    prisma.adminSession.deleteMany({ where: { adminId: admin.id } }),
    prisma.adminPasskey.deleteMany({ where: { adminId: admin.id } }),
    prisma.adminRecoveryCode.deleteMany({ where: { adminId: admin.id } }),
    prisma.auditLog.create({
      data: {
        action: "account.reset_cli",
        actor: admin.username,
        detail: say(
          `服务器命令行重置密码，关闭两步验证（含恢复码）并删除所有通行密钥${promote ? "；网站没有站长，恢复为站长" : ""}`,
          `Password reset from the server command line; two-factor authentication (with recovery codes) turned off and all passkeys deleted${promote ? "; the site had no owner, so this account is the owner again" : ""}`,
        ),
      },
    }),
  ]);

  const turnstileOff = await disableTurnstile();
  if (turnstileOff) {
    await prisma.auditLog.create({ data: { action: "turnstile.settings", actor: admin.username, detail: say("服务器命令行关闭人机验证", "Human verification turned off from the server command line") } });
  }

  console.log(say(`✅ 已重置账号 ${admin.username}`, `✅ Account ${admin.username} reset`));
  if (promote) console.log(say("   网站里没有站长，这个账号已恢复为站长。", "   The site had no owner, so this account is the owner again."));
  if (!values.password) console.log(say(`   新密码：${password}`, `   New password: ${password}`));
  console.log(
    say("   两步验证已关闭、通行密钥已全部删除，所有已登录设备已退出。", "   Two-factor authentication is off, all passkeys were deleted and every device was signed out."),
  );
  if (turnstileOff) {
    console.log(
      say(
        "   人机验证已关闭（密钥还在），登录后可以在「站点设置 → 人机验证」重新开启。",
        "   Human verification is off (the keys are kept); turn it back on under Site settings → Human verification after signing in.",
      ),
    );
  }
  console.log(
    say(
      "   登录后请立即修改密码，并重新开启两步验证、重新添加通行密钥。",
      "   After signing in, change the password right away and set up two-factor authentication and passkeys again.",
    ),
  );
}

main()
  .catch((error) => {
    console.error(`❌ ${error instanceof Error ? error.message : error}`);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
