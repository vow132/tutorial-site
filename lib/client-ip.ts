import { headers } from "next/headers";

/**
 * 访客 IP。Next 不暴露 socket 地址，只能从反向代理写入的请求头读取；
 * 这些头可被客户端伪造，所以必须显式设置 TRUST_PROXY=true（即确认
 * Next 只能经由会覆盖这些头的 Nginx/Caddy 访问）才采信，否则返回 null。
 */
export async function getClientIp(): Promise<string | null> {
  if (process.env.TRUST_PROXY !== "true") return null;
  const store = await headers();
  const realIp = store.get("x-real-ip")?.trim();
  if (realIp) return realIp.slice(0, 64);
  // 最右侧一项由最近的代理追加，左侧的项可能是客户端自己伪造的。
  const forwarded = store.get("x-forwarded-for")?.split(",").pop()?.trim();
  return forwarded ? forwarded.slice(0, 64) : null;
}

export async function getUserAgent(): Promise<string | null> {
  const value = (await headers()).get("user-agent");
  return value ? value.slice(0, 200) : null;
}
