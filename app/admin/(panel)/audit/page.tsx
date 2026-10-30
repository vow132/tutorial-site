import type { Metadata } from "next";
import { requireAdminPage } from "@/lib/admin-auth";
import { prisma } from "@/lib/prisma";

export const metadata: Metadata = { title: "安全日志" };
export const dynamic = "force-dynamic";

const LABELS: Record<string, string> = {
  "login.success": "登录成功",
  "login.failed": "登录失败",
  "login.totp_failed": "两步验证失败",
  logout: "退出登录",
  "session.revoke_others": "退出其他设备",
  "session.revoke_all": "退出所有设备",
  "account.update": "修改账号",
  "account.reset_cli": "命令行重置账号",
  "totp.enable": "开启两步验证",
  "totp.disable": "关闭两步验证",
  "tutorial.create": "新建教程",
  "tutorial.update": "编辑教程",
  "tutorial.delete": "删除教程",
  "tutorial.publish": "发布教程",
  "tutorial.unpublish": "撤回教程",
  "category.create": "新建分类",
  "category.update": "编辑分类",
  "category.delete": "删除分类",
  "settings.update": "修改站点设置",
  upload: "上传图片",
  "site-update.start": "启动网站更新",
  "site-update.denied": "网站更新被拒绝",
};

const WARNING = new Set([
  "login.failed",
  "login.totp_failed",
  "site-update.denied",
  "account.reset_cli",
  "totp.disable",
]);

const dateFormat = new Intl.DateTimeFormat("zh-CN", {
  dateStyle: "short",
  timeStyle: "medium",
});

function countRecentFailedLogins() {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
  return prisma.auditLog.count({
    where: { action: { in: ["login.failed", "login.totp_failed"] }, createdAt: { gte: since } },
  });
}

export default async function AuditLogPage() {
  await requireAdminPage();
  const [entries, failedLogins] = await Promise.all([
    prisma.auditLog.findMany({ orderBy: { id: "desc" }, take: 200 }),
    countRecentFailedLogins(),
  ]);

  return (
    <div>
      <h1 className="text-2xl font-bold text-ink">安全日志</h1>
      <p className="mt-1 text-sm text-ink-3">
        最近 200 条后台操作记录，保留一年。过去 24 小时登录失败 {failedLogins} 次
        {failedLogins >= 20 ? "，数量偏高，建议确认已开启两步验证。" : "。"}
      </p>

      <div className="mt-6 overflow-x-auto rounded-3xl border border-line bg-surface">
        <table className="w-full min-w-[640px] text-left text-sm">
          <thead className="border-b border-line text-xs text-ink-3">
            <tr>
              <th className="px-5 py-3 font-medium">时间</th>
              <th className="px-5 py-3 font-medium">操作</th>
              <th className="px-5 py-3 font-medium">账号</th>
              <th className="px-5 py-3 font-medium">IP</th>
              <th className="px-5 py-3 font-medium">详情</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {entries.map((entry) => (
              <tr key={entry.id}>
                <td className="whitespace-nowrap px-5 py-3 text-ink-3">
                  {dateFormat.format(entry.createdAt)}
                </td>
                <td
                  className={`whitespace-nowrap px-5 py-3 font-medium ${
                    WARNING.has(entry.action) ? "text-red-500" : "text-ink"
                  }`}
                >
                  {LABELS[entry.action] ?? entry.action}
                </td>
                <td className="px-5 py-3 text-ink-2">{entry.actor ?? "—"}</td>
                <td className="whitespace-nowrap px-5 py-3 text-ink-3">{entry.ip ?? "—"}</td>
                <td className="px-5 py-3 text-ink-2">{entry.detail ?? ""}</td>
              </tr>
            ))}
            {entries.length === 0 && (
              <tr>
                <td colSpan={5} className="px-5 py-10 text-center text-ink-3">
                  暂无记录
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <p className="mt-3 text-xs text-ink-3">
        IP 列需要在反向代理后设置 <code>TRUST_PROXY=true</code> 才会记录。
      </p>
    </div>
  );
}
