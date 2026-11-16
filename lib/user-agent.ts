/** 把 User-Agent 粗略归纳成「浏览器 · 系统」，用于登录设备列表和安全告警。 */
export function describeAgent(userAgent: string | null | undefined) {
  if (!userAgent) return "未知设备";
  const browser =
    /Edg\//.test(userAgent) ? "Edge"
    : /Chrome\//.test(userAgent) ? "Chrome"
    : /Firefox\//.test(userAgent) ? "Firefox"
    : /Safari\//.test(userAgent) ? "Safari"
    : "浏览器";
  const os =
    /iPhone|iPad/.test(userAgent) ? "iOS"
    : /Android/.test(userAgent) ? "Android"
    : /Windows/.test(userAgent) ? "Windows"
    : /Mac OS X/.test(userAgent) ? "macOS"
    : /Linux/.test(userAgent) ? "Linux"
    : "未知系统";
  return `${browser} · ${os}`;
}
