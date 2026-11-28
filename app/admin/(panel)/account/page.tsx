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
import DisplayNameForm from "./display-name-form";
import { can, readRole } from "@/lib/roles";
import { getAdminI18n } from "@/lib/i18n/server";
import { rich } from "@/lib/i18n/rich";
import Passkeys from "./passkeys";
import { relyingParty } from "@/lib/passkeys";
import { DisableTwoFactorForm, EnableTwoFactorForm, RegenerateRecoveryCodesForm } from "./two-factor-form";
import { displayIp } from "@/lib/demo";

export async function generateMetadata(): Promise<Metadata> {
  const { m } = await getAdminI18n();
  return { title: m.admin.account.metaTitle };
}
export const dynamic = "force-dynamic";

const DATE_TIME: Intl.DateTimeFormatOptions = { dateStyle: "medium", timeStyle: "short" };

export default async function AdminAccountPage({
  searchParams,
}: {
  searchParams: Promise<{ weak?: string }>;
}) {
  const current = await getCurrentSession();
  if (!current) redirect("/admin/login");
  const { admin, sessionId } = current;
  const { weak } = await searchParams;
  const { m, f, plural, date } = await getAdminI18n();
  const t = m.admin.account;
  const formatTime = (value: Date | string) => date(value, DATE_TIME);

  const sessions = await prisma.adminSession.findMany({
    where: { adminId: admin.id, expiresAt: { gt: new Date() } },
    orderBy: { createdAt: "desc" },
  });

  // 安全告警是全站的设置，只有站长能看和改
  const isOwner = can(admin.role, "site");
  const [alertConfig, alertStatus, passkeys, recoveryCodes] = await Promise.all([
    isOwner ? getAlertConfig() : null,
    isOwner ? getAlertStatus() : null,
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
        <h1 className="text-2xl font-bold text-ink">{t.heading}</h1>
        <p className="mt-1 text-sm text-ink-3">{f(t.intro, { role: m.admin.roles[readRole(admin.role)].label })}</p>
      </div>

      {weak && (
        <p className="rounded-2xl border border-amber-500/30 bg-amber-500/10 px-5 py-4 text-sm text-amber-700 dark:text-amber-300">
          {t.weak}
        </p>
      )}

      <section className="rounded-3xl border border-line bg-surface p-6 sm:p-8">
        <h2 className="text-lg font-bold text-ink">{t.bylineHeading}</h2>
        <p className="mb-4 mt-1 text-sm text-ink-3">{t.bylineHint}</p>
        <DisplayNameForm initial={admin.displayName ?? ""} />
      </section>

      <section className="rounded-3xl border border-line bg-surface p-6 sm:p-8">
        <AccountForm username={admin.username} />
      </section>

      <section className="rounded-3xl border border-line bg-surface p-6 sm:p-8">
        <div className="mb-5 flex items-center justify-between gap-3">
          <h2 className="text-lg font-bold text-ink">{t.twoFactor}</h2>
          <span
            className={`rounded-full px-3 py-1 text-xs font-medium ${
              admin.totpSecret
                ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                : "bg-amber-500/10 text-amber-700 dark:text-amber-300"
            }`}
          >
            {admin.totpSecret ? t.on : t.off}
          </span>
        </div>
        {setup ? (
          <EnableTwoFactorForm setup={setup.token} secret={setup.secret} qrDataUrl={setup.qr} />
        ) : (
          <>
            <p className="mb-5 text-sm text-ink-2">
              {rich(t.twoFactorHint, { command: <code>npm run admin:reset</code> })}
            </p>
            <div
              className={`mb-5 rounded-2xl border px-5 py-4 text-sm ${
                recoveryCodes >= 3
                  ? "border-line bg-paper text-ink-2"
                  : "border-amber-500/30 bg-amber-500/10 text-amber-800 dark:text-amber-200"
              }`}
            >
              <p className="font-medium text-ink">{f(t.recoveryLeft, { n: recoveryCodes })}</p>
              <p className="mt-1">
                {recoveryCodes === 0
                  ? t.recoveryNone
                  : recoveryCodes < 3
                    ? t.recoveryLow
                    : t.recoveryOk}
              </p>
              <details className="mt-3" open={recoveryCodes === 0}>
                <summary className="cursor-pointer font-medium text-accent-ink">{t.regenerate}</summary>
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
          <h2 className="text-lg font-bold text-ink">{t.passkeys}</h2>
          <span
            className={`rounded-full px-3 py-1 text-xs font-medium ${
              passkeys.length > 0
                ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                : "bg-paper text-ink-3"
            }`}
          >
            {passkeys.length > 0 ? plural(passkeys.length, t.passkeysCount) : t.passkeysNone}
          </span>
        </div>
        <p className="mb-5 text-sm text-ink-3">
          {t.passkeysHint}
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

      {isOwner && alertConfig && alertStatus && (
      <section id="alerts" className="rounded-3xl border border-line bg-surface p-6 sm:p-8">
        <div className="mb-2 flex items-center justify-between gap-3">
          <h2 className="text-lg font-bold text-ink">{t.alerts}</h2>
          <span
            className={`rounded-full px-3 py-1 text-xs font-medium ${
              alertConfig.channel !== "off"
                ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                : "bg-amber-500/10 text-amber-700 dark:text-amber-300"
            }`}
          >
            {alertConfig.channel !== "off" ? t.on : t.off}
          </span>
        </div>
        <p className="mb-5 text-sm text-ink-3">
          {t.alertsHint}
        </p>
        {alertConfig.locked && (
          <p className="mb-5 rounded-xl bg-red-500/10 px-4 py-3 text-sm text-red-500 dark:text-red-400">
            {t.alertsLocked}
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
            {f(t.lastPush, { time: formatTime(alertStatus.lastAt), title: alertStatus.lastTitle ?? "" })}
            {alertStatus.lastOk ? t.lastPushOk : f(t.lastPushFailed, { error: alertStatus.lastError ?? t.unknownReason })}
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
      )}

      <section className="rounded-3xl border border-line bg-surface p-6 sm:p-8">
        <h2 className="text-lg font-bold text-ink">{t.devices}</h2>
        <p className="mt-1 text-sm text-ink-3">{t.devicesHint}</p>
        <ul className="mt-5 divide-y divide-line rounded-2xl border border-line">
          {sessions.map((session) => (
            <li key={session.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm">
              <span className="font-medium text-ink">
                {describeAgent(session.userAgent, t)}
                {session.id === sessionId && (
                  <span className="ml-2 rounded-full bg-accent-soft px-2 py-0.5 text-xs text-accent">{t.current}</span>
                )}
              </span>
              <span className="text-xs text-ink-3">
                {session.ip ? `${displayIp(session.ip)} · ` : ""}
                {f(t.signedInAt, { time: formatTime(session.createdAt) })}
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
              {t.revokeOthers}
            </button>
          </form>
          <form action={logoutEverywhere}>
            <button
              type="submit"
              className="h-10 rounded-xl border border-red-500/40 px-5 text-sm font-medium text-red-500 transition-colors hover:bg-red-500/10"
            >
              {t.revokeAll}
            </button>
          </form>
        </div>
      </section>
    </div>
  );
}
