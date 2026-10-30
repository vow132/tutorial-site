import type { Metadata } from "next";
import { redirect } from "next/navigation";
import qrcode from "qrcode-generator";
import { prisma } from "@/lib/prisma";
import { getCurrentSession } from "@/lib/admin-auth";
import { logoutEverywhere, revokeOtherSessions } from "@/lib/actions/account";
import { getSettings } from "@/lib/settings";
import { signTotpSetup } from "@/lib/session";
import { generateTotpSecret, totpUri } from "@/lib/totp";
import AccountForm from "./account-form";
import { DisableTwoFactorForm, EnableTwoFactorForm } from "./two-factor-form";

export const metadata: Metadata = { title: "账号安全" };
export const dynamic = "force-dynamic";

const dateFormat = new Intl.DateTimeFormat("zh-CN", {
  dateStyle: "medium",
  timeStyle: "short",
});

function describeAgent(userAgent: string | null) {
  if (!userAgent) return "未知设备";
  const browser =
    /Edg\//.test(userAgent) ? "Edge"
    : /Chrome\//.test(userAgent) ? "Chrome"
    : /Firefox\//.test(userAgent) ? "Firefox"
    : /Safari\//.test(userAgent) ? "Safari"
    : "浏览器";
  const os =
    /iPhone|iPad/.test(userAgent) ? "iOS"
    : /Android/.test(userAgent) ? "Android"
    : /Windows/.test(userAgent) ? "Windows"
    : /Mac OS X/.test(userAgent) ? "macOS"
    : /Linux/.test(userAgent) ? "Linux"
    : "未知系统";
  return `${browser} · ${os}`;
}

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
              手机丢失时可在服务器上运行 <code>npm run admin:reset</code> 重置。
            </p>
            <DisableTwoFactorForm />
          </>
        )}
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
                {session.ip ? `${session.ip} · ` : ""}登录于 {dateFormat.format(session.createdAt)}
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
