import assert from "node:assert/strict";
import { test } from "node:test";
import { MAX_NAV_LINKS, navHrefProblem, parseNavLinksInput, readNavLinks } from "./settings-extras";

test("navigation links accept site paths and http(s) URLs only", () => {
  for (const href of ["/about", "/tags/前端", "/search?q=docker", "https://github.com/example", "http://example.com/a#b"]) {
    assert.equal(navHrefProblem(href), null, href);
  }
  for (const href of ["javascript:alert(1)", "//evil.example", "data:text/html,x", "mailto:a@b.c", "about", "/a b", `/${"x".repeat(600)}`]) {
    assert.ok(navHrefProblem(href), href);
  }
});

test("the admin form drops empty rows, trims values and explains what is wrong", () => {
  assert.deepEqual(
    parseNavLinksInput({
      position: "before",
      links: [{ label: " 关于 ", href: " /about " }, { label: "", href: "" }, { label: "社区", href: "https://bbs.example.com" }],
    }),
    { data: { position: "before", links: [{ label: "关于", href: "/about" }, { label: "社区", href: "https://bbs.example.com" }] } },
  );
  assert.deepEqual(parseNavLinksInput({ position: "weird", links: [] }), { data: { position: "after", links: [] } });
  assert.match((parseNavLinksInput({ position: "after", links: [{ label: "", href: "/about" }] }) as { error: string }).error, /第 1 个导航链接没有填文字/);
  assert.match((parseNavLinksInput({ position: "after", links: [{ label: "关于", href: "" }] }) as { error: string }).error, /没有填地址/);
  assert.match(
    (parseNavLinksInput({ position: "after", links: [{ label: "x", href: "/a" }, { label: "坏", href: "javascript:alert(1)" }] }) as { error: string }).error,
    /第 2 个导航链接的地址/,
  );
  assert.match((parseNavLinksInput({ position: "after", links: [{ label: "非常非常长的导航文字", href: "/a" }] }) as { error: string }).error, /最多 8 个字/);
  const tooMany = Array.from({ length: MAX_NAV_LINKS + 1 }, (_, i) => ({ label: `L${i}`, href: `/p${i}` }));
  assert.match((parseNavLinksInput({ position: "after", links: tooMany }) as { error: string }).error, /最多 6 个/);
  assert.match((parseNavLinksInput({ position: "after", links: "nope" }) as { error: string }).error, /格式有误/);
});

test("stored navigation links are read defensively", () => {
  assert.deepEqual(readNavLinks(undefined), { position: "after", links: [] });
  assert.deepEqual(
    readNavLinks({ position: "before", links: [{ label: "关于", href: "/about", extra: 1 }, { label: "坏", href: "javascript:x" }, null, { label: 1, href: "/x" }] }),
    { position: "before", links: [{ label: "关于", href: "/about" }] },
  );
});
