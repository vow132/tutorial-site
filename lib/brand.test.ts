import assert from "node:assert/strict";
import { test } from "node:test";
import { accentVariables, brandCss } from "./brand";
import { brandIconVersion } from "./brand-icon";
import { contrastRatio } from "./color";
import { parseBrandInput, readBrand } from "./settings-extras";
import { shareImageVersion, siteShareCard, siteShareImagePath } from "./share-image";
import { SITE_VERSION, versionLabel } from "./version";

test("the default or an invalid accent colour adds no CSS", () => {
  for (const value of ["", "#6366f1", "#6366F1", "red", "#fff", "#12345g", "#6366f1;}body{display:none"]) {
    assert.equal(brandCss(value), "", value);
  }
});

test("any accent colour gets text variants that stay readable on both themes", () => {
  for (const hex of ["#facc15", "#22c55e", "#0ea5e9", "#ef4444", "#111827", "#ffffff", "#a855f7", "#000000"]) {
    const { light, dark } = accentVariables(hex);
    assert.ok(contrastRatio(light.accentInk, "#ffffff") >= 4.5, `${hex} light ink`);
    assert.ok(contrastRatio(light.accentInk, "#f7f8fa") >= 4.5, `${hex} light ink on page`);
    assert.ok(contrastRatio(light.brand, "#ffffff") >= 4.5, `${hex} logo text`);
    assert.ok(contrastRatio(light.chart, "#ffffff") >= 3, `${hex} chart`);
    assert.ok(contrastRatio(dark.accentInk, "#161d27") >= 4.5, `${hex} dark ink`);
    assert.ok(contrastRatio(dark.accent, "#0d1117") >= 3, `${hex} dark accent`);
  }
});

test("the injected CSS covers both themes and only contains colour values", () => {
  const css = brandCss("#0EA5E9");
  assert.match(css, /^html:root\{--color-accent:#0ea5e9;/);
  assert.match(css, /html:root\[data-theme="dark"\]\{--color-accent:/);
  assert.equal(css.match(/--color-brand:/g)?.length, 2);
  // 只有颜色值，没有能跳出样式的字符
  assert.doesNotMatch(css.replace(/html:root(\[data-theme="dark"\])?\{|\}/g, ""), /[{}<>]/);
});

test("stored brand settings fall back to safe defaults", () => {
  assert.deepEqual(readBrand(undefined), { logoImage: "", favicon: "", shareImage: "", accentColor: "", mascot: true });
  assert.deepEqual(readBrand({ accentColor: "#ABCDEF", mascot: false, logoImage: 1 }), {
    logoImage: "",
    favicon: "",
    shareImage: "",
    accentColor: "#abcdef",
    mascot: false,
  });
  assert.equal(readBrand({ accentColor: "url(x)" }).accentColor, "");
});

test("brand form input is validated", () => {
  const empty = { logoImage: "", favicon: "", shareImage: "", accentColor: "", mascot: true };
  assert.deepEqual(parseBrandInput(empty), { data: empty });
  assert.deepEqual(parseBrandInput({ ...empty, accentColor: " #6366F1 " }), { data: empty }, "the default colour is stored as empty");
  assert.deepEqual(parseBrandInput({ ...empty, accentColor: "#0EA5E9", logoImage: "/uploads/logo-1.webp" }), {
    data: { ...empty, accentColor: "#0ea5e9", logoImage: "/uploads/logo-1.webp" },
  });
  assert.match((parseBrandInput({ ...empty, accentColor: "blue" }) as { error: string }).error, /RRGGBB/);
  for (const key of ["logoImage", "favicon", "shareImage"] as const) {
    assert.match((parseBrandInput({ ...empty, [key]: "https://evil.example/x.png" }) as { error: string }).error, /上传/);
    assert.match((parseBrandInput({ ...empty, [key]: "/uploads/../.env" }) as { error: string }).error, /上传/);
  }
});

test("the favicon URL version follows the uploaded file", () => {
  assert.equal(brandIconVersion(""), "");
  assert.equal(brandIconVersion("/uploads/abc-123.png"), "abc-123");
  assert.equal(brandIconVersion("/elsewhere/abc.png"), "");
});

test("the admin version label shows the build commit only when it is valid", () => {
  assert.match(SITE_VERSION, /^\d+\.\d+\.\d+$/);
  assert.equal(versionLabel(""), `v${SITE_VERSION}`);
  assert.equal(versionLabel("not-a-commit"), `v${SITE_VERSION}`);
  assert.equal(versionLabel("0123456789abcdef0123456789abcdef01234567"), `v${SITE_VERSION} · 0123456`);
});

test("the site share image uses the hero text and changes with the accent colour", () => {
  const settings = {
    siteName: "教程网",
    logoText: "教",
    siteTitle: "教程网 · 高质量图文教程",
    heroBadge: "持续更新的知识库",
    heroTitleA: "把复杂的知识",
    heroTitleB: "讲得",
    heroAccent: "简单明白",
    brand: { accentColor: "" },
  };
  const card = siteShareCard(settings);
  assert.equal(card.title, "把复杂的知识讲得简单明白");
  assert.equal(card.categoryName, "持续更新的知识库");
  assert.equal(card.accent, "#6366f1");
  assert.equal(siteShareCard({ ...settings, heroTitleA: "", heroTitleB: "", heroAccent: "" }).title, settings.siteTitle);
  assert.match(siteShareImagePath(card), /^\/og\/site\?v=[\w-]{12}$/);
  assert.notEqual(shareImageVersion(siteShareCard({ ...settings, brand: { accentColor: "#0ea5e9" } })), shareImageVersion(card));
});
