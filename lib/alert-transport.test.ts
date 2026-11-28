import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { createRequire } from "node:module";
import test from "node:test";
import {
  buildAlertRequest,
  notifyFromDatabase,
  parseAlertConfig,
  sendAlert,
  validateAlertConfig,
} from "./alert-transport.mjs";

const message = { site: "教程网", event: "login.success", title: "新设备登录了后台", lines: ["账号：admin"] };
const NOW = 1_763_280_000_123;

test("only official robot hosts are accepted for named channels", () => {
  assert.equal(validateAlertConfig({ channel: "dingtalk", url: "https://oapi.dingtalk.com/robot/send?access_token=x" }), null);
  assert.match(validateAlertConfig({ channel: "dingtalk", url: "https://evil.example/robot/send" }) ?? "", /host/);
  assert.match(validateAlertConfig({ channel: "wecom", url: "http://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=x" }) ?? "", /host/);
  assert.equal(validateAlertConfig({ channel: "feishu", url: "https://open.larksuite.com/open-apis/bot/v2/hook/x" }), null);
  assert.equal(validateAlertConfig({ channel: "webhook", url: "https://hooks.example.com/a" }), null);
  assert.equal(validateAlertConfig({ channel: "webhook", url: "http://127.0.0.1:9000/hook" }), null);
  assert.match(validateAlertConfig({ channel: "webhook", url: "http://10.0.0.5/hook" }) ?? "", /https/);
  assert.match(validateAlertConfig({ channel: "telegram", telegramToken: "bad", telegramChatId: "1" }) ?? "", /telegramToken/);
  assert.equal(
    validateAlertConfig({ channel: "telegram", telegramToken: "123456:ABCDEFGHIJKLMNOPQRSTUVWXYZ", telegramChatId: "-100123456" }),
    null,
  );
});

test("broken or invalid stored config is treated as off", () => {
  assert.equal(parseAlertConfig(null).channel, "off");
  assert.equal(parseAlertConfig("{not json").channel, "off");
  assert.equal(parseAlertConfig(JSON.stringify({ channel: "dingtalk", url: "https://evil.example" })).channel, "off");
  assert.equal(parseAlertConfig(JSON.stringify({ channel: "wecom", url: "https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=k" })).backupReminder, true);
});

test("DingTalk requests are signed with HmacSHA256(secret, timestamp\\nsecret)", () => {
  const secret = "SECabc";
  const { url, body } = buildAlertRequest(
    { channel: "dingtalk", url: "https://oapi.dingtalk.com/robot/send?access_token=tok", secret },
    message,
    NOW,
  );
  const parsed = new URL(url);
  assert.equal(parsed.searchParams.get("access_token"), "tok");
  assert.equal(parsed.searchParams.get("timestamp"), String(NOW));
  assert.equal(
    parsed.searchParams.get("sign"),
    createHmac("sha256", secret).update(`${NOW}\n${secret}`).digest("base64"),
  );
  assert.deepEqual(body, { msgtype: "text", text: { content: "【教程网】新设备登录了后台\n账号：admin" } });
});

test("Feishu signs with the timestamp+secret as the HMAC key", () => {
  const { body } = buildAlertRequest(
    { channel: "feishu", url: "https://open.feishu.cn/open-apis/bot/v2/hook/x", secret: "s3" },
    message,
    NOW,
  );
  const timestamp = String(Math.floor(NOW / 1000));
  assert.equal(body.timestamp, timestamp);
  assert.equal(body.sign, createHmac("sha256", `${timestamp}\ns3`).update("").digest("base64"));
  assert.deepEqual(body.content, { text: "【教程网】新设备登录了后台\n账号：admin" });
});

test("Telegram and generic webhook payloads", () => {
  const telegram = buildAlertRequest(
    { channel: "telegram", telegramToken: "123456:ABCDEFGHIJKLMNOPQRSTUVWXYZ", telegramChatId: "42" },
    message,
    NOW,
  );
  assert.equal(telegram.url, "https://api.telegram.org/bot123456:ABCDEFGHIJKLMNOPQRSTUVWXYZ/sendMessage");
  assert.equal(telegram.body.chat_id, "42");
  const webhook = buildAlertRequest({ channel: "webhook", url: "https://hooks.example.com/a" }, message, NOW);
  assert.equal(webhook.body.event, "login.success");
  assert.deepEqual(webhook.body.lines, ["账号：admin"]);
  assert.equal(webhook.body.time, new Date(NOW).toISOString());
});

function fakeFetch(status: number, body: unknown) {
  const calls: Array<{ url: string; init: RequestInit }> = [];
  const impl = (async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    return new Response(typeof body === "string" ? body : JSON.stringify(body), { status });
  }) as unknown as typeof fetch;
  return { impl, calls };
}

test("HTTP 200 with a business error code is reported as a failure", async () => {
  const config = { channel: "dingtalk" as const, url: "https://oapi.dingtalk.com/robot/send?access_token=t" };
  const ok = fakeFetch(200, { errcode: 0, errmsg: "ok" });
  await sendAlert(config, message, { fetchImpl: ok.impl });
  assert.equal(ok.calls[0].init.method, "POST");
  const keyword = fakeFetch(200, { errcode: 310000, errmsg: "keywords not in content" });
  await assert.rejects(sendAlert(config, message, { fetchImpl: keyword.impl }), /310000/);
  const down = fakeFetch(502, "bad gateway");
  await assert.rejects(sendAlert(config, message, { fetchImpl: down.impl }), /http: 502/);
});

test("scripts read the config from SQLite and never throw", async () => {
  const require = createRequire(import.meta.url);
  const Database = require("better-sqlite3");
  const db = new Database(":memory:");
  db.exec('CREATE TABLE "Setting" ("key" TEXT PRIMARY KEY, "value" TEXT)');
  // 未配置：不发送
  assert.equal(await notifyFromDatabase(db, { event: "backup.failed", title: "x" }), false);
  // 配置了但地址不可达：只打印错误，返回 false
  db.prepare('INSERT INTO "Setting" VALUES (?, ?)').run(
    "alerts",
    JSON.stringify({ channel: "webhook", url: "http://127.0.0.1:9/unreachable" }),
  );
  const originalError = console.error;
  console.error = () => {};
  try {
    assert.equal(await notifyFromDatabase(db, { event: "backup.failed", title: "x" }), false);
  } finally {
    console.error = originalError;
    db.close();
  }
});

test("alert settings are stored encrypted and fail closed when the key changes", async () => {
  const { serializeAlertConfig } = await import("./alert-transport.mjs");
  const env = { NODE_ENV: "production", AUTH_SECRET: "s".repeat(48) };
  const config = { channel: "telegram" as const, telegramToken: "123456:ABCDEFGHIJKLMNOPQRSTUVWXYZ", telegramChatId: "123456" };
  const stored = serializeAlertConfig({ ...config, locked: true }, env);
  assert.ok(!stored.includes("ABCDEFGHIJ"));
  assert.deepEqual(parseAlertConfig(stored, env), { ...config, url: undefined, secret: undefined, backupReminder: true });
  assert.deepEqual(parseAlertConfig(stored, { ...env, AUTH_SECRET: "t".repeat(48) }), { channel: "off", locked: true });
});
