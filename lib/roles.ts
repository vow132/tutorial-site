/**
 * 后台角色和权限（纯函数，服务端和浏览器共用）。
 *
 * - 站长 owner：全部，包括站点设置、账号管理、邮件订阅、安全日志、告警、一键更新；
 * - 编辑 editor：所有教程、分类 / 标签 / 系列、关于页、读者留言、批量导入；
 * - 作者 author：只能写、改、发布、删除自己的教程。
 *
 * 校验入口在 lib/admin-auth.ts：requireAuth / requireSession / requireAdminPage 不传权限时**只允许站长**，
 * 所以新加的页面和 Server Action 默认只有站长能用，要开放给编辑、作者时显式写上权限。
 */

export const ROLES = {
  owner: { label: "站长", description: "全部权限：站点设置、账号管理、邮件订阅、安全日志、一键更新" },
  editor: { label: "编辑", description: "管理所有教程、分类、标签、系列、关于页和读者留言，可以批量导入" },
  author: { label: "作者", description: "只能写、改、发布、删除自己的教程" },
} as const;

export type Role = keyof typeof ROLES;

export const ROLE_ORDER: Role[] = ["owner", "editor", "author"];

export type Permission =
  /** 仪表盘（阅读数据） */
  | "dashboard"
  /** 自己的账号：密码、署名、两步验证、通行密钥 */
  | "account"
  /** 写教程（作者只能动自己的） */
  | "tutorials"
  /** 修改别人的教程 */
  | "tutorials.others"
  /** 分类、标签、系列 */
  | "taxonomy"
  | "about"
  /** 读者留言 */
  | "feedback"
  | "import"
  /** 站长才有的：站点设置、账号管理、订阅、安全日志、告警、一键更新、示例数据 */
  | "site";

const GRANTS: Record<Role, ReadonlySet<Permission>> = {
  owner: new Set<Permission>(["dashboard", "account", "tutorials", "tutorials.others", "taxonomy", "about", "feedback", "import", "site"]),
  editor: new Set<Permission>(["dashboard", "account", "tutorials", "tutorials.others", "taxonomy", "about", "feedback", "import"]),
  author: new Set<Permission>(["dashboard", "account", "tutorials"]),
};

/** 数据库里的值不认识时按权限最小的作者处理。 */
export function readRole(value: unknown): Role {
  return value === "owner" || value === "editor" || value === "author" ? value : "author";
}

export function can(role: unknown, permission: Permission): boolean {
  return GRANTS[readRole(role)].has(permission);
}

/** 能不能修改这篇教程：编辑和站长都能，作者只能改自己的。 */
export function canEditTutorial(user: { id: number; role: unknown }, tutorial: { authorId: number | null }): boolean {
  return can(user.role, "tutorials.others") || (can(user.role, "tutorials") && tutorial.authorId === user.id);
}

/** 文章页显示的署名：只用后台填的署名，不公开登录用户名。 */
export function bylineOf(author: { displayName: string | null } | null | undefined): string | null {
  const name = author?.displayName?.trim();
  return name ? name : null;
}

export const MAX_DISPLAY_NAME = 20;

/** 署名的校验：去掉首尾空白，最长 20 个字；空串表示不显示署名。 */
export function parseDisplayName(raw: unknown): { value: string | null } | { error: string } {
  const value = typeof raw === "string" ? raw.replace(/\s+/g, " ").trim() : "";
  if (!value) return { value: null };
  if (Array.from(value).length > MAX_DISPLAY_NAME) return { error: `署名最多 ${MAX_DISPLAY_NAME} 个字` };
  if (/[<>]/.test(value)) return { error: "署名不能包含 < 或 >" };
  return { value };
}

/** 后台登录用户名的规则（和账号安全页一致）。 */
export const USERNAME_PATTERN = /^[A-Za-z0-9_-]{3,32}$/;
