import assert from "node:assert/strict";
import { test } from "node:test";
import { buildSecurityTxt, normalizeSecurityContact } from "./security-txt";

test("security contacts accept an email or an https URL", () => {
  assert.equal(normalizeSecurityContact(""), "");
  assert.equal(normalizeSecurityContact(" security@example.com "), "mailto:security@example.com");
  assert.equal(normalizeSecurityContact("mailto:sec@example.com"), "mailto:sec@example.com");
  assert.equal(normalizeSecurityContact("https://example.com/security"), "https://example.com/security");
  for (const bad of ["http://example.com", "javascript:alert(1)", "not an email", "a@b"]) {
    assert.equal(normalizeSecurityContact(bad), null, bad);
  }
});

test("security.txt carries the required fields and a near-future expiry", () => {
  const now = Date.parse("2026-11-17T15:30:00Z");
  const text = buildSecurityTxt({ contact: "mailto:sec@example.com", canonical: "https://example.com/.well-known/security.txt", now });
  assert.equal(
    text,
    [
      "Contact: mailto:sec@example.com",
      "Expires: 2027-05-16T00:00:00.000Z",
      "Preferred-Languages: zh, en",
      "Canonical: https://example.com/.well-known/security.txt",
      "",
    ].join("\n"),
  );
});
