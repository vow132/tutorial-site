import { headers } from "next/headers";

/** 只认 IP 地址里会出现的字符，别的（伪造的长串、脚本）一律不要 */
const IP_LIKE = /^[0-9A-Fa-f:.]{2,45}$/;

/**
 * 从请求头里取访客 IP（纯函数，单元测试用）。Next 不暴露 socket 地址，只能从反向代理写入的请求头读取；
 * 这些头可被客户端伪造，所以必须显式设置 TRUST_PROXY 才采信，否则返回 null：
 *
 * - `TRUST_PROXY=true`：Next 只能经由会覆盖这些头的 Nginx / Caddy 访问。先读 X-Real-IP，没有再取
 *   X-Forwarded-For 最右侧一项（由最近的代理追加，左侧的项可能是客户端自己伪造的）。
 * - `TRUST_PROXY=cloudflare`：网站接在 Cloudflare 后面（橙色云朵），读 Cloudflare 写入的 CF-Connecting-IP。
 *   前提是源站只允许 Cloudflare 的 IP 访问（防火墙或 Nginx），否则别人绕过 Cloudflare 直连源站就能伪造这个头。
 *   Cloudflare → Nginx → Next 时，更推荐在 Nginx 用 real_ip 模块还原真实 IP、仍设 TRUST_PROXY=true（见 README）。
 */
export function clientIpFrom(get: (name: string) => string | null | undefined, trust: string | undefined): string | null {
  const clean = (value: string | null | undefined) => {
    const ip = value?.trim();
    return ip && IP_LIKE.test(ip) ? ip : null;
  };
  if (trust === "cloudflare") return clean(get("cf-connecting-ip"));
  if (trust !== "true") return null;
  const realIp = clean(get("x-real-ip"));
  if (realIp) return realIp;
  return clean(get("x-forwarded-for")?.split(",").pop());
}

/** 访客 IP（见 clientIpFrom）。 */
export async function getClientIp(): Promise<string | null> {
  const trust = process.env.TRUST_PROXY;
  if (trust !== "true" && trust !== "cloudflare") return null;
  const store = await headers();
  return clientIpFrom((name) => store.get(name), trust);
}

/** 设置了 TRUST_PROXY（true 或 cloudflare）、能拿到真实访客 IP。 */
export function trustsProxy() {
  return process.env.TRUST_PROXY === "true" || process.env.TRUST_PROXY === "cloudflare";
}

export async function getUserAgent(): Promise<string | null> {
  const value = (await headers()).get("user-agent");
  return value ? value.slice(0, 200) : null;
}
