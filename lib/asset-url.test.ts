import assert from "node:assert/strict";
import { test } from "node:test";
import { assetSrcSet, assetUrl, parseAssetHost, readAssetHost, rewriteAssetHtml } from "./asset-url";

const HOST = "https://img.example.com";

test("the image host must be a plain https address", () => {
  assert.deepEqual(parseAssetHost(""), { value: "" });
  assert.deepEqual(parseAssetHost("  https://img.example.com/  "), { value: HOST });
  assert.deepEqual(parseAssetHost("https://cdn.example.com/site-a/"), { value: "https://cdn.example.com/site-a" });
  for (const bad of ["img.example.com", "http://img.example.com", "ftp://x.com", "https://x.com/?a=1", "https://x.com/#a", "https://u:p@x.com", "javascript:alert(1)"]) {
    assert.ok("error" in parseAssetHost(bad), bad);
  }
  assert.equal(readAssetHost("http://insecure.example.com"), "", "an invalid stored value counts as not set");
  assert.equal(readAssetHost(42), "");
});

test("only site uploads are moved to the image host", () => {
  assert.equal(assetUrl("/uploads/a-1.webp", HOST), `${HOST}/uploads/a-1.webp`);
  assert.equal(assetUrl("/uploads/a-1.webp", ""), "/uploads/a-1.webp");
  for (const other of ["/og/site?v=1", "https://elsewhere.example/a.png", "/brand/icon?s=32", ""]) assert.equal(assetUrl(other, HOST), other);
  assert.equal(assetUrl(null, HOST), null);
  assert.equal(assetUrl(`${HOST}/uploads/a.webp`, HOST), `${HOST}/uploads/a.webp`, "idempotent");
});

test("article HTML: src and every srcset entry move, links stay on the site", () => {
  const html =
    '<p><a href="/uploads/a.webp"><img src="/uploads/a.webp" srcset="/uploads/a-400w.webp 400w, /uploads/a.webp 1600w" alt="a"></a>' +
    '<img src="https://other.example/b.png" alt="b"><img src="data:image/png;base64,xx" alt="c"></p>';
  const out = rewriteAssetHtml(html, HOST);
  assert.match(out, new RegExp(`<a href="/uploads/a\\.webp">`));
  assert.match(out, new RegExp(`src="${HOST}/uploads/a\\.webp"`));
  assert.match(out, new RegExp(`srcset="${HOST}/uploads/a-400w\\.webp 400w, ${HOST}/uploads/a\\.webp 1600w"`));
  assert.match(out, /src="https:\/\/other\.example\/b\.png"/);
  assert.match(out, /src="data:image\/png;base64,xx"/);
  assert.equal(rewriteAssetHtml(html, ""), html);
  assert.equal(assetSrcSet("/uploads/a-400w.webp 400w, /uploads/a.webp 800w", HOST), `${HOST}/uploads/a-400w.webp 400w, ${HOST}/uploads/a.webp 800w`);
  assert.equal(assetSrcSet(null, HOST), undefined);
});
