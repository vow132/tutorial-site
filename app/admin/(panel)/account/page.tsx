import type { Metadata } from "next";
import { redirect } from "next/navigation";
import qrcode from "qrcode-generator";
import { prisma } from "@/lib/prisma";
import { getCurrentSession } from "@/lib/admin-auth";
import { logoutEverywhere, revokeOtherSessions } from "@/lib/actions/account";
import { getSettings } from "@/lib/settings";
import { signTotpSetup } from "@/lib/session";
import { generateTotpSecret, totpUri } from "@/lib/totp";
import { describeAgent } from "@/lib/user-agent";
import { getAlertConfig, getAlertStatus } from "@/lib/alerts";
import AccountForm from "./account-form";
import AlertsForm from "./alerts-form";
import Passkeys from "./passkeys";
import { relyingParty } from "@/lib/passkeys";
import { DisableTwoFactorForm, EnableTwoFactorForm, RegenerateRecoveryCodesForm } from "./two-factor-form";
import { displayIp } from "@/lib/demo";

export const metadata: Metadata = { title: "账号安全" };
export const dynamic = "force-dynamic";

const dateFormat = new Intl.DateTimeFormat("zh-CN", {
  dateStyle: "medium",
  timeStyle: "short",
});

export default async function AdminAccountPage({
  searchParams,
}: {
  searchParams: Promise<{ weak?: string }>;
}) {
  const current = await getCurrentSession();
  if (!current) redirect("/admin/login");
  const { admin, sessionId } = current;
  const { weak } = await searchParams;

  const sessions = await prisma.adminSession.findMany({
    where: { adminId: admin.id, expiresAt: { gt: new Date() } },
    orderBy: { createdAt: "desc" },
  });

  const [alertConfig, alertStatus, passkeys, recoveryCodes] = await Promise.all([
    getAlertConfig(),
    getAlertStatus(),
    prisma.adminPasskey.findMany({
      where: { adminId: admin.id },
      orderBy: { createdAt: "asc" },
      select: { id: true, name: true, createdAt: true, lastUsedAt: true, backedUp: true },
    }),
    prisma.adminRecoveryCode.count({ where: { adminId: admin.id } }),
  ]);
  const rp = relyingParty();

  let setup: { token: string; secret: string; qr: string } | null = null;
  if (!admin.totpSecret) {
    const secret = generateTotpSecret();
    const { siteName } = await getSettings();
    const qr = qrcode(0, "M");
    qr.addData(totpUri(secret, admin.username, siteName));
    qr.make();
    setup = { token: signTotpSetup(admin.id, secret), secret, qr: qr.createDataURL(4, 2) };
  }

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-ink">账号安全</h1>
        <p className="mt-1 text-sm text-ink-3">
          修改管理员用户名或密码，保存后当前浏览器保持登录，其他设备需要重新登录。
        </p>
      </div>

      {weak && (
        <p className="rounded-2xl border border-amber-500/30 bg-amber-500/10 px-5 py-4 text-sm text-amber-700 dark:text-amber-300">
          当前密码是默认密码或过于简单，很容易被撞库猜中，请立即修改为至少 10 位、不常见的密码，并建议开启两步验证。
        </p>
      )}

      <section className="rounded-3xl border border-line bg-surface p-6 sm:p-8">
        <AccountForm username={admin.username} />
      </section>

      <section className="rounded-3xl border border-line bg-surface p-6 sm:p-8">
        <div className="mb-5 flex items-center justify-between gap-3">
          <h2 className="text-lg font-bold text-ink">两步验证</h2>
          <span
            className={`rounded-full px-3 py-1 text-xs font-medium ${
              admin.totpSecret
                ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                : "bg-amber-500/10 text-amber-700 dark:text-amber-300"
            }`}
          >
            {admin.totpSecret ? "已开启" : "未开启"}
          </span>
        </div>
        {setup ? (
          <EnableTwoFactorForm setup={setup.token} secret={setup.secret} qrDataUrl={setup.qr} />
        ) : (
          <>
            <p className="mb-5 text-sm text-ink-2">
              登录时除密码外还需要验证器中的 6 位数字。关闭前需要验证当前密码和验证码；
              手机丢失时用恢复码登录，恢复码也用完时可在服务器上运行 <code>npm run admin:reset</code> 重置。
            </p>
            <div
              className={`mb-5 rounded-2xl border px-5 py-4 text-sm ${
                recoveryCodes >= 3
                  ? "border-line bg-paper text-ink-2"
                  : "border-amber-500/30 bg-amber-500/10 text-amber-800 dark:text-amber-200"
              }`}
            >
              <p className="font-medium text-ink">恢复码：剩余 {recoveryCodes} 个</p>
              <p className="mt-1">
                {recoveryCodes === 0
                  ? "还没有可用的恢复码，手机丢失时只能到服务器上重置。建议现在生成一组并妥善保存。"
                  : recoveryCodes < 3
                    ? "恢复码快用完了，建议重新生成一组（旧的会全部作废）。"
                    : "每个恢复码只能用一次，用掉的会自动作废。"}
              </p>
              <details className="mt-3" open={recoveryCodes === 0}>
                <summary className="cursor-pointer font-medium text-accent-ink">重新生成恢复码</summary>
                <div className="mt-4">
                  <RegenerateRecoveryCodesForm />
                </div>
              </details>
            </div>
            <DisableTwoFactorForm />
          </>
        )}
      </section>

      <section id="passkeys" className="rounded-3xl border border-line bg-surface p-6 sm:p-8">
        <div className="mb-2 flex items-center justify-between gap-3">
          <h2 className="text-lg font-bold text-ink">通行密钥</h2>
          <span
            className={`rounded-full px-3 py-1 text-xs font-medium ${
              passkeys.length > 0
                ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                : "bg-paper text-ink-3"
            }`}
          >
            {passkeys.length > 0 ? `已登记 ${passkeys.length} 个` : "未登记"}
          </span>
        </div>
        <p className="mb-5 text-sm text-ink-3">
          用指纹、面容、手机或安全密钥登录，不用输入密码，钓鱼网站也骗不走。通行密钥本身已包含设备 +
          生物识别两重验证，用它登录时不再需要两步验证码；密码登录照常可用。
        </p>
        <Passkeys
          passkeys={passkeys.map((row) => ({
            id: row.id,
            name: row.name,
            createdAt: row.createdAt.toISOString(),
            lastUsedAt: row.lastUsedAt?.toISOString() ?? null,
            backedUp: row.backedUp,
          }))}
          unavailable={"error" in rp ? rp.error : null}
        />
      </section>

      <section id="alerts" className="rounded-3xl border border-line bg-surface p-6 sm:p-8">
        <div className="mb-2 flex items-center justify-between gap-3">
          <h2 className="text-lg font-bold text-ink">安全告警</h2>
          <span
            className={`rounded-full px-3 py-1 text-xs font-medium ${
              alertConfig.channel !== "off"
                ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                : "bg-amber-500/10 text-amber-700 dark:text-amber-300"
            }`}
          >
            {alertConfig.channel !== "off" ? "已开启" : "未开启"}
          </span>
        </div>
        <p className="mb-5 text-sm text-ink-3">
          新设备登录、登录被锁定、修改密码或两步验证、网站更新结果、备份失败或过期时，
          实时推送到你的手机。推送失败不影响登录等操作本身。
        </p>
        {alertConfig.locked && (
          <p className="mb-5 rounded-xl bg-red-500/10 px-4 py-3 text-sm text-red-500 dark:text-red-400">
            已保存的告警设置无法解密（服务器上的 AUTH_SECRET 或 DATA_ENCRYPTION_KEY 被更换过），告警目前不会推送。请重新填写并保存。
          </p>
        )}
        {alertStatus.lastAt && (
          <p
            className={`mb-5 rounded-xl px-4 py-3 text-xs ${
              alertStatus.lastOk
                ? "bg-paper text-ink-3"
                : "bg-red-500/10 text-red-500 dark:text-red-400"
            }`}
          >
            上次推送：{dateFormat.format(new Date(alertStatus.lastAt))}「{alertStatus.lastTitle}」
            {alertStatus.lastOk ? " 成功" : ` 失败：${alertStatus.lastError ?? "未知原因"}`}
          </p>
        )}
        <AlertsForm
          initial={{
            channel: alertConfig.channel,
            url: alertConfig.url ?? "",
            hasSecret: Boolean(alertConfig.secret),
            hasTelegramToken: Boolean(alertConfig.telegramToken),
            telegramChatId: alertConfig.telegramChatId ?? "",
            backupReminder: alertConfig.backupReminder !== false,
          }}
        />
      </section>

      <section className="rounded-3xl border border-line bg-surface p-6 sm:p-8">
        <h2 className="text-lg font-bold text-ink">登录设备</h2>
        <p className="mt-1 text-sm text-ink-3">
          每次登录都会生成一个可随时吊销的会话，有效期 7 天。看到不认识的设备请立即吊销并修改密码。
        </p>
        <ul className="mt-5 divide-y divide-line rounded-2xl border border-line">
          {sessions.map((session) => (
            <li key={session.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm">
              <span className="font-medium text-ink">
                {describeAgent(session.userAgent)}
                {session.id === sessionId && (
                  <span className="ml-2 rounded-full bg-accent-soft px-2 py-0.5 text-xs text-accent">当前</span>
                )}
              </span>
              <span className="text-xs text-ink-3">
                {session.ip ? `${displayIp(session.ip)} · ` : ""}登录于 {dateFormat.format(session.createdAt)}
              </span>
            </li>
          ))}
        </ul>
        <div className="mt-5 flex flex-wrap gap-3">
          <form action={revokeOtherSessions}>
            <button
              type="submit"
              disabled={sessions.length <= 1}
              className="h-10 rounded-xl border border-line px-5 text-sm font-medium text-ink-2 transition-colors hover:bg-paper hover:text-ink disabled:opacity-40"
            >
              退出其他设备
            </button>
          </form>
          <form action={logoutEverywhere}>
            <button
              type="submit"
              className="h-10 rounded-xl border border-red-500/40 px-5 text-sm font-medium text-red-500 transition-colors hover:bg-red-500/10"
            >
              退出所有设备
            </button>
          </form>
        </div>
      </section>
    </div>
  );
}
