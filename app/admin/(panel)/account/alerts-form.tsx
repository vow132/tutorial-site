"use client";

import { startTransition, useActionState, useState } from "react";
import { ALERT_CHANNELS, type AlertChannel } from "@/lib/alert-channels.mjs";
import { saveAlertSettings, sendTestAlert, type AlertFormState } from "@/lib/actions/alerts";
import { useAdminI18n } from "@/lib/i18n/client";

const inputClass =
  "h-11 w-full rounded-xl border border-line bg-paper px-4 text-sm outline-none transition-colors focus:border-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent/60 focus:bg-surface";

export type AlertFormInitial = {
  channel: AlertChannel;
  url: string;
  hasSecret: boolean;
  hasTelegramToken: boolean;
  telegramChatId: string;
  backupReminder: boolean;
};

function Feedback({ state }: { state: AlertFormState }) {
  if (state.error) {
    return <p className="rounded-xl bg-red-500/10 px-4 py-3 text-sm text-red-500 dark:text-red-400">{state.error}</p>;
  }
  if (state.success) {
    return (
      <p className="rounded-xl bg-emerald-500/10 px-4 py-3 text-sm text-emerald-600 dark:text-emerald-400">
        {state.success}
      </p>
    );
  }
  return null;
}

export default function AlertsForm({ initial }: { initial: AlertFormInitial }) {
  const [channel, setChannel] = useState<AlertChannel>(initial.channel);
  const [saveState, saveAction, saving] = useActionState<AlertFormState, FormData>(saveAlertSettings, {});
  const [testState, testAction, testing] = useActionState<AlertFormState, FormData>(sendTestAlert, {});
  const [last, setLast] = useState<"save" | "test" | null>(null);
  const sameChannel = channel === initial.channel;
  const { m } = useAdminI18n();
  const t = m.admin.alertsForm;

  return (
    <form
      className="space-y-4"
      // 手动提交：两个按钮各走各的 action，出错时也不清空已填内容（React 19 默认会重置表单）。
      onSubmit={(event) => {
        event.preventDefault();
        const submitter = (event.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null;
        const formData = new FormData(event.currentTarget, submitter);
        const intent = submitter?.value === "test" ? "test" : "save";
        setLast(intent);
        startTransition(() => (intent === "test" ? testAction : saveAction)(formData));
      }}
    >
      <div>
        <label htmlFor="alert-channel" className="mb-1.5 block text-sm font-medium text-ink-2">
          {t.channel}
        </label>
        <select
          id="alert-channel"
          name="channel"
          value={channel}
          onChange={(event) => setChannel(event.target.value as AlertChannel)}
          className={inputClass}
        >
          {ALERT_CHANNELS.map((item) => (
            <option key={item.value} value={item.value}>
              {m.admin.alertChannels[item.value]}
            </option>
          ))}
        </select>
        <p className="mt-1.5 text-xs leading-relaxed text-ink-3">{t.hints[channel]}</p>
      </div>

      {channel !== "off" && channel !== "telegram" && (
        <div>
          <label htmlFor="alert-url" className="mb-1.5 block text-sm font-medium text-ink-2">
            {t.url}
          </label>
          <input
            id="alert-url"
            name="url"
            type="url"
            defaultValue={sameChannel ? initial.url : ""}
            placeholder="https://"
            autoComplete="off"
            className={inputClass}
          />
        </div>
      )}

      {(channel === "dingtalk" || channel === "feishu") && (
        <div>
          <label htmlFor="alert-secret" className="mb-1.5 block text-sm font-medium text-ink-2">
            {channel === "dingtalk" ? t.dingtalkSecret : t.feishuSecret}
          </label>
          <input
            id="alert-secret"
            name="secret"
            type="password"
            autoComplete="off"
            placeholder={sameChannel && initial.hasSecret ? t.keepSecret : ""}
            className={inputClass}
          />
        </div>
      )}

      {channel === "telegram" && (
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="alert-token" className="mb-1.5 block text-sm font-medium text-ink-2">
              Bot Token
            </label>
            <input
              id="alert-token"
              name="telegramToken"
              type="password"
              autoComplete="off"
              placeholder={sameChannel && initial.hasTelegramToken ? t.keepSecret : "123456:ABC…"}
              className={inputClass}
            />
          </div>
          <div>
            <label htmlFor="alert-chat" className="mb-1.5 block text-sm font-medium text-ink-2">
              Chat ID
            </label>
            <input
              id="alert-chat"
              name="telegramChatId"
              defaultValue={sameChannel ? initial.telegramChatId : ""}
              placeholder={t.chatIdPlaceholder}
              autoComplete="off"
              className={inputClass}
            />
          </div>
        </div>
      )}

      <label className="flex items-start gap-2.5 text-sm text-ink-2">
        <input
          type="checkbox"
          name="backupReminder"
          defaultChecked={initial.backupReminder}
          className="mt-0.5 h-4 w-4 accent-accent"
        />
        <span>{t.backupReminder}</span>
      </label>

      <div>
        <label htmlFor="alert-password" className="mb-1.5 block text-sm font-medium text-ink-2">
          {t.currentPassword}
          <span className="ml-2 text-xs font-normal text-ink-3">{t.currentPasswordHint}</span>
        </label>
        <input
          id="alert-password"
          name="currentPassword"
          type="password"
          autoComplete="current-password"
          className={`${inputClass} sm:max-w-xs`}
        />
      </div>

      {last && <Feedback state={last === "test" ? testState : saveState} />}

      <div className="flex flex-wrap gap-3">
        <button
          type="submit"
          name="intent"
          value="save"
          disabled={saving}
          className="h-11 rounded-xl bg-btn px-6 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          {saving ? m.admin.common.saving : t.submit}
        </button>
        {channel !== "off" && (
          <button
            type="submit"
            name="intent"
            value="test"
            disabled={testing}
            className="h-11 rounded-xl border border-line px-6 text-sm font-medium text-ink-2 transition-colors hover:bg-paper hover:text-ink disabled:opacity-50"
          >
            {testing ? t.sending : t.sendTest}
          </button>
        )}
      </div>
    </form>
  );
}
