import assert from "node:assert/strict";
import test from "node:test";
import { LOCALES } from "./i18n/locales";
import { messagesFor } from "./i18n/messages";
import { format, plural } from "./i18n/format";

const zh = messagesFor("zh-CN");
const PLURAL_KEYS = new Set(["zero", "one", "two", "few", "many", "other"]);
const placeholders = (text: string) => new Set([...text.matchAll(/\{(\w+)\}/g)].map((match) => match[1]));
const isPlural = (value: unknown): value is Record<string, string> =>
  !!value && typeof value === "object" && !Array.isArray(value) && "other" in value && Object.keys(value).every((key) => PLURAL_KEYS.has(key));

/** 把字典展开成「路径 → 文字（或复数对象）」 */
function leaves(value: unknown, path = ""): Array<[string, string | Record<string, string> | string[]]> {
  if (typeof value === "string" || isPlural(value) || Array.isArray(value)) return [[path, value as string]];
  return Object.entries(value as Record<string, unknown>).flatMap(([key, child]) => leaves(child, path ? `${path}.${key}` : key));
}

const zhLeaves = new Map(leaves(zh));

for (const locale of LOCALES.filter((item) => item !== "zh-CN")) {
  test(`${locale}: every text keeps the same placeholders as the Chinese original`, () => {
    const problems: string[] = [];
    for (const [path, value] of leaves(messagesFor(locale))) {
      const original = zhLeaves.get(path);
      if (original === undefined) {
        problems.push(`${path}: not in zh-CN`);
        continue;
      }
      if (typeof original === "string") {
        if (typeof value !== "string") problems.push(`${path}: should be a string`);
        else if ([...placeholders(original)].sort().join() !== [...placeholders(value)].sort().join()) {
          problems.push(`${path}: ${[...placeholders(value)]} ≠ ${[...placeholders(original)]}`);
        }
      } else if (Array.isArray(original)) {
        if (!Array.isArray(value) || value.length !== original.length) problems.push(`${path}: should be an array of ${original.length}`);
      } else {
        if (!isPlural(value)) {
          problems.push(`${path}: should be a plural object`);
          continue;
        }
        // 复数的每一种写法：除了 {n}（有的语言单数不写数字），变量要和中文一样
        const expected = [...placeholders(original.other)].filter((name) => name !== "n").sort().join();
        for (const [form, text] of Object.entries(value)) {
          const got = [...placeholders(text)].filter((name) => name !== "n").sort().join();
          if (got !== expected) problems.push(`${path}.${form}: ${got} ≠ ${expected}`);
        }
      }
    }
    assert.deepEqual(problems, []);
  });
}

test("plural forms follow each language's rules", () => {
  const views = (locale: (typeof LOCALES)[number], n: number) => plural(locale, n, messagesFor(locale).site.views);
  assert.equal(views("en", 1), "1 view");
  assert.equal(views("en", 2), "2 views");
  assert.equal(views("ru", 1), "1 просмотр");
  assert.equal(views("ru", 3), "3 просмотра");
  assert.equal(views("ru", 5), "5 просмотров");
  assert.equal(views("ru", 21), "21 просмотр");
  assert.equal(views("ja", 1000), "1,000 回閲覧");
  assert.equal(views("zh-CN", 12345), "12,345 次阅读");
  assert.equal(format(messagesFor("en").site.search.resultsFor, { query: "css" }), "Results for “css”");
});
