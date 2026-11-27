import { prisma } from "@/lib/prisma";
import { can, readRole } from "@/lib/roles";
import { getAdminI18n } from "@/lib/i18n/server";

/**
 * 教程表单里「作者」下拉框的选项：只有能改别人教程的编辑和站长才看得到，作者自己的表单不显示这个字段。
 * 显示署名（没填时显示用户名，后台内部可见）和角色。
 */
export async function authorOptions(admin: { role: string }) {
  if (!can(admin.role, "tutorials.others")) return null;
  const { m, f } = await getAdminI18n();
  const rows = await prisma.admin.findMany({
    orderBy: { id: "asc" },
    select: { id: true, username: true, displayName: true, role: true },
  });
  return rows.map((row) => ({
    id: row.id,
    label: f(m.admin.authorOption, { name: row.displayName || row.username, role: m.admin.roles[readRole(row.role)].label }),
  }));
}
