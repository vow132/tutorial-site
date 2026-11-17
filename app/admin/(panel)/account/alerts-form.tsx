"use client";

import { startTransition, useActionState, useState } from "react";
import { ALERT_CHANNELS, type AlertChannel } from "@/lib/alert-channels.mjs";
import { saveAlertSettings, sendTestAlert, type AlertFormState } from "@/lib/actions/alerts";

const inputClass =
  "h-11 w-full rounded-xl border border-line bg-paper px-4 text-sm outline-none transition-colors focus:border-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent/60 focus:bg-surface";

const HINTS: Record<AlertChannel, string> = {
  off: "关闭后不会推送任何消息，安全日志照常记录。",
  dingtalk:
    "群设置 → 机器人 → 添加「自定义」机器人，复制 Webhook。安全设置建议选「加签」并把密钥填在下面；选「自定义关键词」时请填网站名称。",
  feishu: "群设置 → 群机器人 → 添加「自定义机器人」，复制 Webhook；开启「签名校验」时把密钥填在下面。",
  wecom: "群聊 → 右上角 → 添加群机器人，复制 Webhook 地址。",
  telegram: "向 @BotFather 发送 /newbot 得到 Token；先给机器人发一条消息或拉进群，再用 getUpdates 查到 Chat ID。国内服务器可能无法访问 Telegram。",
  webhook: "以 POST 发送 JSON：{ event, title, lines, text, site, time }，可接入自建的通知服务。",
};

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
          推送渠道
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
              {item.label}
            </option>
          ))}
        </select>
        <p className="mt-1.5 text-xs leading-relaxed text-ink-3">{HINTS[channel]}</p>
      </div>

      {channel !== "off" && channel !== "telegram" && (
        <div>
          <label htmlFor="alert-url" className="mb-1.5 block text-sm font-medium text-ink-2">
            Webhook 地址
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
            {channel === "dingtalk" ? "加签密钥（SEC 开头，可选）" : "签名校验密钥（可选）"}
          </label>
          <input
            id="alert-secret"
            name="secret"
            type="password"
            autoComplete="off"
            placeholder={sameChannel && initial.hasSecret ? "已设置，留空则不修改" : ""}
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
              placeholder={sameChannel && initial.hasTelegramToken ? "已设置，留空则不修改" : "123456:ABC…"}
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
              placeholder="如 123456789 或 @channel"
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
        <span>
          备份提醒：超过 2 天没有新的数据库备份时提醒（每天最多一次）
        </span>
      </label>

      <div>
        <label htmlFor="alert-password" className="mb-1.5 block text-sm font-medium text-ink-2">
          当前密码<span className="ml-2 text-xs font-normal text-ink-3">保存时需要；只发测试消息可以不填</span>
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
          {saving ? "保存中…" : "保存告警设置"}
        </button>
        {channel !== "off" && (
          <button
            type="submit"
            name="intent"
            value="test"
            disabled={testing}
            className="h-11 rounded-xl border border-line px-6 text-sm font-medium text-ink-2 transition-colors hover:bg-paper hover:text-ink disabled:opacity-50"
          >
            {testing ? "发送中…" : "发送测试消息"}
          </button>
        )}
      </div>
    </form>
  );
}
