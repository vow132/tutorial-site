/** 登录后的跳转只允许站内 /admin 路径，防止 open redirect。 */
export function safeAdminFrom(raw: string | null | undefined): string {
  if (raw && /^\/admin(?:\/|$)/.test(raw) && !raw.startsWith("/admin//")) return raw;
  return "/admin";
}
