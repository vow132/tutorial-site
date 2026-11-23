import { lookup as dnsLookup, type LookupAddress } from "node:dns";
import http from "node:http";
import https from "node:https";
import { BlockList, isIP, type LookupFunction } from "node:net";

/**
 * 批量导入时把外链图片（旧网站、图床）下载到本站。服务器替用户发请求，要防 SSRF：
 * - 只允许 http / https，不带用户名密码，只连常见端口；
 * - 域名解析出的每个地址都必须是公网地址（内网、本机、云服务器元数据地址 169.254.169.254 等一律拒绝），
 *   而且连接用的就是校验过的那个地址（在 lookup 里校验），不会被 DNS 重绑定绕过；
 * - 跳转最多 3 次，每一跳都重新校验；限制大小和总时长。
 */

const blocked = new BlockList();
for (const [network, prefix] of [
  ["0.0.0.0", 8], ["10.0.0.0", 8], ["100.64.0.0", 10], ["127.0.0.0", 8], ["169.254.0.0", 16], ["172.16.0.0", 12],
  ["192.0.0.0", 24], ["192.0.2.0", 24], ["192.88.99.0", 24], ["192.168.0.0", 16], ["198.18.0.0", 15],
  ["198.51.100.0", 24], ["203.0.113.0", 24], ["224.0.0.0", 4], ["240.0.0.0", 4],
] as const) blocked.addSubnet(network, prefix, "ipv4");
for (const [network, prefix] of [
  ["::", 127], ["64:ff9b::", 96], ["64:ff9b:1::", 48], ["100::", 64], ["2001::", 23], ["2001:db8::", 32],
  ["2002::", 16], ["fc00::", 7], ["fe80::", 10], ["fec0::", 10], ["ff00::", 8],
] as const) blocked.addSubnet(network, prefix, "ipv6");

/** 是不是可以访问的公网地址（IPv4、IPv6，含 ::ffff:1.2.3.4 这种 IPv4 映射写法）。 */
export function isPublicAddress(address: string): boolean {
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(address);
  if (mapped) return isPublicAddress(mapped[1]);
  const family = isIP(address);
  if (family === 0) return false;
  if (family === 6 && /^::ffff:/i.test(address)) {
    // 十六进制写法的 IPv4 映射地址（::ffff:7f00:1）
    const [high, low] = address.slice(7).split(":").map((part) => parseInt(part, 16));
    if (Number.isFinite(high) && Number.isFinite(low)) return isPublicAddress([high >> 8, high & 255, low >> 8, low & 255].join("."));
  }
  return !blocked.check(address, family === 4 ? "ipv4" : "ipv6");
}

export class RemoteImageError extends Error {}

export type RemoteImageOptions = {
  /** 最大字节数，默认 10MB */
  maxBytes?: number;
  /** 总时长，默认 20 秒 */
  timeoutMs?: number;
  maxRedirects?: number;
  /** 地址是否允许连接（测试用；默认只允许公网地址） */
  isAllowed?: (address: string) => boolean;
  /** 允许的端口（测试用） */
  ports?: ReadonlySet<string>;
};

const DEFAULT_PORTS: ReadonlySet<string> = new Set(["", "80", "443", "8080", "8443"]);
const REDIRECTS = new Set([301, 302, 303, 307, 308]);

function checkUrl(raw: string, ports: ReadonlySet<string>): URL {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new RemoteImageError("图片地址无效");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") throw new RemoteImageError("只能下载 http / https 图片");
  if (url.username || url.password) throw new RemoteImageError("图片地址不能带用户名密码");
  if (!ports.has(url.port)) throw new RemoteImageError(`不支持端口 ${url.port}`);
  return url;
}

function request(url: URL, isAllowed: (address: string) => boolean, deadline: number): Promise<http.IncomingMessage> {
  return new Promise((resolve, reject) => {
    const host = url.hostname.replace(/^\[|\]$/g, "");
    // IP 写的地址不会走 lookup，这里先查
    if (isIP(host) && !isAllowed(host)) {
      reject(new RemoteImageError("不能下载内网或本机地址的图片"));
      return;
    }
    const lookup: LookupFunction = (hostname, options, callback) => {
      dnsLookup(hostname, { all: true, verbatim: true }, (error, addresses) => {
        const list = addresses as unknown as LookupAddress[];
        if (error) return callback(error, "", 4);
        if (!list?.length || list.some((item) => !isAllowed(item.address))) {
          return callback(new RemoteImageError("不能下载内网或本机地址的图片") as NodeJS.ErrnoException, "", 4);
        }
        if ((options as { all?: boolean }).all) return (callback as unknown as (e: null, all: LookupAddress[]) => void)(null, list);
        callback(null, list[0].address, list[0].family);
      });
    };
    const client = url.protocol === "https:" ? https : http;
    const req = client.get(
      url,
      {
        lookup,
        agent: false,
        timeout: Math.max(1, deadline - Date.now()),
        headers: {
          "User-Agent": "Mozilla/5.0 (compatible; TutorialSiteImporter/1.0)",
          Accept: "image/avif,image/webp,image/png,image/*;q=0.8,*/*;q=0.5",
          // 很多图床按 Referer 防盗链：带上图片所在网站自己的地址
          Referer: `${url.origin}/`,
        },
      },
      resolve,
    );
    req.on("timeout", () => req.destroy(new RemoteImageError("下载超时")));
    req.on("error", (error) => reject(error instanceof RemoteImageError ? error : new RemoteImageError(`下载失败：${error.message}`)));
  });
}

/** 下载图片，返回原始字节（格式由调用方按文件头识别）。失败时抛 RemoteImageError。 */
export async function fetchRemoteImage(raw: string, options: RemoteImageOptions = {}): Promise<Buffer> {
  const { maxBytes = 10 * 1024 * 1024, timeoutMs = 20_000, maxRedirects = 3, isAllowed = isPublicAddress, ports = DEFAULT_PORTS } = options;
  const deadline = Date.now() + timeoutMs;
  let url = checkUrl(raw, ports);
  for (let hop = 0; ; hop++) {
    const response = await request(url, isAllowed, deadline);
    const status = response.statusCode ?? 0;
    if (REDIRECTS.has(status)) {
      response.resume();
      const location = response.headers.location;
      if (!location || hop >= maxRedirects) throw new RemoteImageError("跳转次数太多");
      url = checkUrl(new URL(location, url).href, ports);
      continue;
    }
    if (status !== 200) {
      response.resume();
      throw new RemoteImageError(`对方网站返回 ${status}`);
    }
    if (Number(response.headers["content-length"] ?? 0) > maxBytes) {
      response.destroy();
      throw new RemoteImageError("图片太大");
    }
    const chunks: Buffer[] = [];
    let size = 0;
    const timer = setTimeout(() => response.destroy(new RemoteImageError("下载超时")), Math.max(1, deadline - Date.now()));
    try {
      for await (const chunk of response) {
        size += (chunk as Buffer).length;
        if (size > maxBytes) {
          response.destroy();
          throw new RemoteImageError("图片太大");
        }
        chunks.push(chunk as Buffer);
      }
    } catch (error) {
      throw error instanceof RemoteImageError ? error : new RemoteImageError("下载中断");
    } finally {
      clearTimeout(timer);
    }
    return Buffer.concat(chunks);
  }
}
