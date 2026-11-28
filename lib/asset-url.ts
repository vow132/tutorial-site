/**
 * 图片加速（CDN / 对象存储）：站点设置里填一个加速地址（如 https://img.example.com）后，
 * 前台页面里本站上传的图片（/uploads/…）都改用这个地址加载，CDN 或对象存储第一次被访问时
 * 再回到本站取图（回源 / 镜像回源）。
 *
 * 数据库里的正文、封面始终存相对路径 /uploads/…，只在渲染时换地址：开关加速不用改任何内容，
 * 也不用在网站里保存云服务的密钥；图片文件仍然在本站（备份、清理、小图生成都照旧）。
 * 纯函数，服务端和浏览器都能用。
 */

import { textOrKey } from "@/lib/i18n/format";
import type { Messages } from "@/lib/i18n/messages/types";

const UPLOADS = "/uploads/";

/** 后台填的加速地址：留空表示不加速；只收 https，不带查询参数，末尾的 / 去掉。 */
export function parseAssetHost(raw: unknown, t?: Messages["admin"]["settingsErrors"]): { value: string } | { error: string } {
  const value = typeof raw === "string" ? raw.trim().replace(/\/+$/, "") : "";
  if (!value) return { value: "" };
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return { error: textOrKey(t, "assetHostInvalid") };
  }
  if (url.protocol !== "https:") return { error: textOrKey(t, "assetHostHttps") };
  if (url.search || url.hash || url.username || url.password) return { error: textOrKey(t, "assetHostExtra") };
  return { value: `${url.origin}${url.pathname.replace(/\/+$/, "")}` };
}

/** 从存储的设置读出（格式不对时当作没设置）。 */
export function readAssetHost(raw: unknown): string {
  const parsed = parseAssetHost(raw);
  return "value" in parsed ? parsed.value : "";
}

/** 本站上传的图片换成加速地址；其他地址（外链、/og/ 生成图、已经是完整网址的）原样返回。 */
export function assetUrl(path: string, host: string): string;
export function assetUrl(path: string | null | undefined, host: string): string | null | undefined;
export function assetUrl(path: string | null | undefined, host: string) {
  return host && path?.startsWith(UPLOADS) ? `${host}${path}` : path;
}

/** 正文 HTML 里图片的 src 和 srcset（每一项）换成加速地址；链接（href）不动。 */
export function rewriteAssetHtml(html: string, host: string): string {
  if (!host) return html;
  return html.replace(/(\s(src|srcset))="([^"]*)"/gi, (_match, prefix: string, attr: string, value: string) => {
    const next = attr.toLowerCase() === "srcset" ? (assetSrcSet(value, host) ?? value) : assetUrl(value, host);
    return `${prefix}="${next}"`;
  });
}

/** srcset 属性值（「地址 宽度w, …」）里本站上传的图片换成加速地址。 */
export function assetSrcSet(srcset: string | null | undefined, host: string): string | undefined {
  if (!srcset) return undefined;
  return host
    ? srcset
        .split(",")
        .map((part) => {
          const item = part.trim();
          return item.startsWith(UPLOADS) ? `${host}${item}` : item;
        })
        .join(", ")
    : srcset;
}
