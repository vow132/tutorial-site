import assert from "node:assert/strict";
import test from "node:test";
import { LOCALES, type Locale } from "./i18n/locales";
import { messagesFor } from "./i18n/messages";
import { LOCALIZED_TEXT_FIELDS, MAX_FOOTER_STATUS, switchDefaultTexts } from "./locale-defaults";
import { parseStartHereInput } from "./settings-extras";

/** 按字典拼出某个语言的默认文字（和 lib/settings.ts 的 defaultSettingsFor() 一样，但不连数据库） */
function defaultsOf(locale: Locale) {
  const d = messagesFor(locale).defaults;
  return {
    ...Object.fromEntries(LOCALIZED_TEXT_FIELDS.map((field) => [field, d[field]])),
    footerColumns: [
      { title: d.footerCategories, autoCategories: true, links: [] },
      {
        title: d.footerQuickLinks,
        links: [
          { label: d.linkAllTutorials, href: "/tutorials" },
          { label: d.linkAllTags, href: "/tags" },
          { label: d.linkSearch, href: "/search" },
        ],
      },
      {
        title: d.footerAbout,
        links: [
          { label: d.linkAbout, href: "/about" },
          { label: d.linkRss, href: "/feed.xml" },
        ],
      },
    ],
    startHere: { enabled: true, title: d.startHereTitle, intro: d.startHereIntro, seriesSlugs: [] as string[] },
  } as Parameters<typeof switchDefaultTexts>[0];
}

test("switching between any two languages turns every default text into the new language's default", () => {
  for (const from of LOCALES) {
    for (const to of LOCALES) {
      assert.deepEqual(switchDefaultTexts(defaultsOf(from), from, to), defaultsOf(to), `${from} → ${to}`);
    }
  }
});

test("a round trip through every language comes back unchanged", () => {
  let settings = defaultsOf("zh-CN");
  let current: Locale = "zh-CN";
  for (const next of ["en", "ru", "ja", "ru", "zh-CN"] as Locale[]) {
    settings = switchDefaultTexts(settings, current, next);
    current = next;
  }
  assert.deepEqual(settings, defaultsOf("zh-CN"));
});

test("texts the owner changed are kept; footer entries are switched one by one", () => {
  const zh = messagesFor("zh-CN").defaults;
  const settings = {
    ...defaultsOf("zh-CN"),
    siteName: "我的小站",
    footerStatus: "",
    // 老版本的默认页脚少几项，另外加了一个自己的链接
    footerColumns: [
      { title: zh.footerCategories, autoCategories: true, links: [] },
      { title: zh.footerQuickLinks, links: [{ label: zh.linkAllTutorials, href: "/tutorials" }, { label: "交流群", href: "https://example.com" }] },
      { title: "友情链接", links: [{ label: zh.linkRss, href: "/feed.xml" }] },
    ],
    startHere: { enabled: false, title: "新手入门", intro: zh.startHereIntro, seriesSlugs: ["a"] },
  };
  const en = messagesFor("en").defaults;
  const switched = switchDefaultTexts(settings, "zh-CN", "en");
  assert.equal(switched.siteName, "我的小站");
  assert.equal(switched.footerStatus, "");
  assert.equal(switched.siteTitle, en.siteTitle);
  assert.deepEqual(switched.footerColumns, [
    { title: en.footerCategories, autoCategories: true, links: [] },
    { title: en.footerQuickLinks, links: [{ label: en.linkAllTutorials, href: "/tutorials" }, { label: "交流群", href: "https://example.com" }] },
    { title: "友情链接", links: [{ label: en.linkRss, href: "/feed.xml" }] },
  ]);
  assert.deepEqual(switched.startHere, { enabled: false, title: "新手入门", intro: en.startHereIntro, seriesSlugs: ["a"] });
  // 原对象不变
  assert.equal(settings.siteTitle, zh.siteTitle);
});

test("Russian uses the same word for the About column and link, they still map back separately", () => {
  const switched = switchDefaultTexts(defaultsOf("ru"), "ru", "zh-CN");
  const zh = messagesFor("zh-CN").defaults;
  assert.equal(switched.footerColumns[2].title, zh.footerAbout);
  assert.equal(switched.footerColumns[2].links[0].label, zh.linkAbout);
});

test("every language's defaults survive the length limits of the settings form", () => {
  for (const locale of LOCALES) {
    const d = messagesFor(locale).defaults;
    assert.ok(Array.from(d.footerStatus).length <= MAX_FOOTER_STATUS, `${locale} footerStatus`);
    assert.equal(Array.from(d.logoText).length, 1, `${locale} logoText`);
    const startHere = parseStartHereInput({ enabled: true, title: d.startHereTitle, intro: d.startHereIntro, seriesSlugs: [] });
    assert.equal(startHere.title, d.startHereTitle, `${locale} startHere.title`);
    assert.equal(startHere.intro, d.startHereIntro, `${locale} startHere.intro`);
  }
});
