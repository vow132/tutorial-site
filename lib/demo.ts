/**
 * 演示站模式：环境变量 DEMO_MODE=true 时打开，用来公开展示这套程序（前台 + 后台都能随便看）。
 *
 * - 后台只读：requireAuth() / requireSession() 直接拒绝（所有写操作的 Server Action 都经过它们），
 *   上传图片、一键更新这类接口返回 403；后台页面里提交表单时先在浏览器里拦下来并说明原因（components/demo-guard.tsx）。
 *   所以访客改不了内容、密码、两步验证，也不能把别人踢下线，演示数据不会被弄乱，不需要定时重置。
 * - 访客写的文字不入库、不展示给别人：读者留言直接丢弃，搜索词和来源网站不统计（阅读量、「有帮助吗」计数照常）；
 *   后台里其他访客的 IP 只显示前两段，登录失败时填的用户名不显示。
 * - 登录页和顶部横幅显示演示账号（ADMIN_USERNAME / ADMIN_PASSWORD，也就是第一次启动时建管理员用的那组）。
 *
 * 搭演示站：全新部署时 .env 里写好演示账号和 DEMO_MODE=true，第一次启动就是带示例教程的演示站；
 * 要换内容时先关掉演示模式重启、写好或导入，再打开（见 README「演示站」）。
 */

/** 运行时读取（不要在模块顶层求值成常量：Docker 镜像是构建好再按 .env 运行的）。 */
export function isDemoMode(): boolean {
  return process.env.DEMO_MODE?.trim() === "true";
}

/** 演示模式下公开的后台账号；没设置 ADMIN_PASSWORD 时不显示。 */
export function demoAccount(): { username: string; password: string } | null {
  if (!isDemoMode()) return null;
  const password = process.env.ADMIN_PASSWORD?.trim();
  return password ? { username: process.env.ADMIN_USERNAME?.trim() || "admin", password } : null;
}

/** IP 只保留前两段（IPv4）或前两组（IPv6），看得出大致来源，认不出具体的人。 */
export function maskIp(ip: string): string {
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(ip)) return ip.split(".").slice(0, 2).concat("*", "*").join(".");
  if (ip.includes(":")) return `${ip.split(":").filter(Boolean).slice(0, 2).join(":")}:*`;
  return "*";
}

/** 后台显示访客 IP 时用：演示模式下打码。 */
export function displayIp(ip: string | null | undefined): string | null {
  if (!ip) return null;
  return isDemoMode() ? maskIp(ip) : ip;
}

/** 邮箱只露第一个字和域名：a***@example.com。 */
export function maskEmail(email: string): string {
  const at = email.lastIndexOf("@");
  if (at <= 0) return "***";
  return `${Array.from(email.slice(0, at))[0]}***${email.slice(at)}`;
}

/** 后台显示订阅者邮箱时用：演示模式下打码（演示站应该单独部署，这里是兜底）。 */
export function displayEmail(email: string): string {
  return isDemoMode() ? maskEmail(email) : email;
}
