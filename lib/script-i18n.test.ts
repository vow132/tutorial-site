import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";
import { LOCALES } from "./i18n/locales";
import { messagesFor } from "./i18n/messages";
import { cliText, localeFromSiteSetting, SCRIPT_LOCALES, SCRIPT_TEXT, scriptText, siteLocaleFrom } from "./script-i18n.mjs";

const placeholders = (text: string) => [...text.matchAll(/\{(\w+)\}/g)].map((match) => match[1]).sort();
const zh = SCRIPT_TEXT["zh-CN"] as Record<string, string>;

test("every language has the same script texts and placeholders as Chinese", () => {
  // 运维脚本的语言表要和网站的一致（.mjs 脚本引用不到 TS 的 lib/i18n/locales.ts）
  assert.deepEqual(SCRIPT_LOCALES, [...LOCALES]);
  for (const locale of SCRIPT_LOCALES) {
    const table = SCRIPT_TEXT[locale as keyof typeof SCRIPT_TEXT] as Record<string, string>;
    assert.deepEqual(Object.keys(table).sort(), Object.keys(zh).sort(), locale);
    for (const [key, value] of Object.entries(table)) {
      assert.ok(value.trim(), `${locale} ${key} is empty`);
      assert.deepEqual(placeholders(value), placeholders(zh[key]), `${locale} ${key}`);
    }
  }
});

test("update progress matches the admin's phase texts, so the status reads the same either way", () => {
  for (const locale of LOCALES) {
    const phases = messagesFor(locale).admin.update.phases;
    const t = scriptText(locale);
    for (const phase of ["preflight", "fetch", "install", "build", "activate", "health", "complete", "rollback"]) {
      assert.equal(t(`progress.${phase}`), phases[phase], `${locale} ${phase}`);
    }
  }
});

test("scriptText fills placeholders and falls back to Chinese", () => {
  assert.equal(scriptText("en")("newRevision", { rev: "abc1234" }), "New version: abc1234");
  assert.equal(scriptText(null)("updateFailed"), "网站更新失败");
  assert.equal(scriptText("xx")("updateFailed"), "网站更新失败");
});

test("command-line text is Chinese for Chinese sites, English otherwise, both when the language is unknown", () => {
  assert.equal(cliText("zh-CN")("中文", "English"), "中文");
  for (const locale of ["en", "ru", "ja"]) assert.equal(cliText(locale)("中文", "English"), "English");
  assert.equal(cliText(null)("中文", "English"), "中文\nEnglish");
});

test("the site language comes from the site setting row", () => {
  assert.equal(localeFromSiteSetting(undefined), null);
  assert.equal(localeFromSiteSetting("{}"), "zh-CN");
  assert.equal(localeFromSiteSetting('{"locale":"ja"}'), "ja");
  assert.equal(localeFromSiteSetting('{"locale":"fr"}'), "zh-CN");
  assert.equal(localeFromSiteSetting("not json"), "zh-CN");

  const Database = createRequire(import.meta.url)("better-sqlite3");
  const db = new Database(":memory:");
  try {
    assert.equal(siteLocaleFrom(db), null, "no Setting table yet");
    db.exec('CREATE TABLE "Setting" ("key" TEXT PRIMARY KEY, "value" TEXT)');
    assert.equal(siteLocaleFrom(db), null, "no site row yet");
    db.prepare('INSERT INTO "Setting" ("key", "value") VALUES (?, ?)').run("site", '{"locale":"ru"}');
    assert.equal(siteLocaleFrom(db), "ru");
  } finally {
    db.close();
  }
});
