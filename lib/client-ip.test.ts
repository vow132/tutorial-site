import assert from "node:assert/strict";
import { test } from "node:test";
import { clientIpFrom } from "./client-ip";

const from = (headers: Record<string, string>) => (name: string) => headers[name] ?? null;

test("without TRUST_PROXY no header is trusted", () => {
  const get = from({ "x-real-ip": "203.0.113.7", "cf-connecting-ip": "198.51.100.2" });
  assert.equal(clientIpFrom(get, undefined), null);
  assert.equal(clientIpFrom(get, "false"), null);
  assert.equal(clientIpFrom(get, "1"), null);
});

test("TRUST_PROXY=true: X-Real-IP, else the right-most X-Forwarded-For entry", () => {
  assert.equal(clientIpFrom(from({ "x-real-ip": " 203.0.113.7 " }), "true"), "203.0.113.7");
  assert.equal(clientIpFrom(from({ "x-forwarded-for": "6.6.6.6, 203.0.113.7" }), "true"), "203.0.113.7");
  assert.equal(clientIpFrom(from({ "x-forwarded-for": "2001:db8::1" }), "true"), "2001:db8::1");
  // Cloudflare 的头在这个模式下不算数（Nginx 没配 real_ip 时它可能是伪造的）
  assert.equal(clientIpFrom(from({ "cf-connecting-ip": "198.51.100.2" }), "true"), null);
});

test("TRUST_PROXY=cloudflare: only CF-Connecting-IP", () => {
  const get = from({ "cf-connecting-ip": "198.51.100.2", "x-real-ip": "172.70.1.1", "x-forwarded-for": "172.70.1.1" });
  assert.equal(clientIpFrom(get, "cloudflare"), "198.51.100.2");
  assert.equal(clientIpFrom(from({ "cf-connecting-ip": "2001:db8::abcd" }), "cloudflare"), "2001:db8::abcd");
  assert.equal(clientIpFrom(from({ "x-real-ip": "172.70.1.1" }), "cloudflare"), null);
});

test("values that are not IP addresses are ignored", () => {
  assert.equal(clientIpFrom(from({ "x-real-ip": "<script>" }), "true"), null);
  assert.equal(clientIpFrom(from({ "x-real-ip": "1".repeat(80) }), "true"), null);
  assert.equal(clientIpFrom(from({ "cf-connecting-ip": "evil.example.com" }), "cloudflare"), null);
  assert.equal(clientIpFrom(from({ "x-real-ip": "" , "x-forwarded-for": "203.0.113.7" }), "true"), "203.0.113.7");
});
