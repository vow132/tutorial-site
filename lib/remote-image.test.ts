import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { after, before, test } from "node:test";
import { fetchRemoteImage, isPublicAddress, RemoteImageError } from "./remote-image";

test("only public addresses are allowed", () => {
  for (const address of ["8.8.8.8", "1.1.1.1", "2606:4700:4700::1111", "::ffff:8.8.8.8"]) {
    assert.equal(isPublicAddress(address), true, address);
  }
  for (const address of [
    "127.0.0.1", "10.1.2.3", "172.16.0.1", "172.31.255.255", "192.168.1.1", "169.254.169.254", "100.64.0.1", "0.0.0.0",
    "224.0.0.1", "255.255.255.255", "::1", "::", "fd00::1", "fe80::1", "::ffff:127.0.0.1", "::ffff:7f00:1", "::ffff:a9fe:a9fe",
    "64:ff9b::7f00:1", "not-an-ip",
  ]) {
    assert.equal(isPublicAddress(address), false, address);
  }
});

const png = Buffer.from("89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d4944415478da63f8ffff3f0005fe02fea7d6a4950000000049454e44ae426082", "hex");
let server: Server;
let base = "";
const seen: Array<string | undefined> = [];

before(async () => {
  server = createServer((req, res) => {
    seen.push(req.headers.referer);
    if (req.url === "/a.png") return res.writeHead(200, { "Content-Type": "image/png" }).end(png);
    if (req.url === "/hop") return res.writeHead(302, { Location: "/a.png" }).end();
    if (req.url === "/to-private") return res.writeHead(302, { Location: "http://10.0.0.1/a.png" }).end();
    if (req.url === "/loop") return res.writeHead(302, { Location: "/loop" }).end();
    if (req.url === "/big") return res.writeHead(200).end(Buffer.alloc(2048));
    if (req.url === "/slow") return setTimeout(() => res.writeHead(200).end(png), 1000);
    res.writeHead(404).end();
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

after(() => server.close());

const port = () => new URL(base).port;
/** 测试服务器在本机：放行 127.0.0.1 和它的端口，其余规则照旧 */
const local = () => ({ isAllowed: (ip: string) => ip === "127.0.0.1" || isPublicAddress(ip), ports: new Set(["", port()]) });

test("downloads an image, following redirects and sending the site's own Referer", async () => {
  assert.deepEqual(await fetchRemoteImage(`${base}/a.png`, local()), png);
  assert.deepEqual(await fetchRemoteImage(`${base}/hop`, local()), png);
  assert.equal(seen.at(-1), `${base}/`);
});

test("refuses local and private targets by default, including through redirects and host names", async () => {
  await assert.rejects(fetchRemoteImage(`${base}/a.png`, { ports: new Set([port()]) }), RemoteImageError);
  await assert.rejects(fetchRemoteImage(`http://localhost:${port()}/a.png`, { ports: new Set([port()]) }), /内网|本机/);
  await assert.rejects(fetchRemoteImage(`${base}/to-private`, local()), /内网|本机/);
  await assert.rejects(fetchRemoteImage("http://169.254.169.254/latest/meta-data/"), /内网|本机/);
  await assert.rejects(fetchRemoteImage("http://[::1]/a.png"), /内网|本机/);
});

test("rejects bad schemes, credentials, odd ports, loops, oversized and slow responses", async () => {
  await assert.rejects(fetchRemoteImage("file:///etc/passwd"), /http/);
  await assert.rejects(fetchRemoteImage("ftp://example.com/a.png"), /http/);
  await assert.rejects(fetchRemoteImage("http://user:pass@example.com/a.png"), /用户名/);
  await assert.rejects(fetchRemoteImage("http://example.com:22/a.png"), /端口/);
  await assert.rejects(fetchRemoteImage(`${base}/loop`, local()), /跳转/);
  await assert.rejects(fetchRemoteImage(`${base}/big`, { ...local(), maxBytes: 1024 }), /太大/);
  await assert.rejects(fetchRemoteImage(`${base}/slow`, { ...local(), timeoutMs: 200 }), /超时/);
  await assert.rejects(fetchRemoteImage(`${base}/missing`, local()), /404/);
});
