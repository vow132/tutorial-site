/** 识别不出来时显示的文字（按语言传入：m.admin.account 里的 unknownDevice / browser / unknownOs） */
export type AgentLabels = { unknownDevice: string; browser: string; unknownOs: string };

/** 把 User-Agent 粗略归纳成「浏览器 · 系统」，用于登录设备列表和安全告警。 */
export function describeAgent(userAgent: string | null | undefined, labels: AgentLabels) {
  if (!userAgent) return labels.unknownDevice;
  const browser =
    /Edg\//.test(userAgent) ? "Edge"
    : /Chrome\//.test(userAgent) ? "Chrome"
    : /Firefox\//.test(userAgent) ? "Firefox"
    : /Safari\//.test(userAgent) ? "Safari"
    : labels.browser;
  const os =
    /iPhone|iPad/.test(userAgent) ? "iOS"
    : /Android/.test(userAgent) ? "Android"
    : /Windows/.test(userAgent) ? "Windows"
    : /Mac OS X/.test(userAgent) ? "macOS"
    : /Linux/.test(userAgent) ? "Linux"
    : labels.unknownOs;
  return `${browser} · ${os}`;
}
