"use client";

import { useActionState } from "react";
import { createUser, deleteUser, resetUserPassword, updateUser, type UserFormState } from "@/lib/actions/users";
import { ROLE_ORDER, ROLES, type Role } from "@/lib/roles";

const inputCls =
  "h-10 w-full rounded-xl border border-line bg-surface px-3 text-sm outline-none transition-colors focus:border-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent/60";

/** 操作结果；新密码单独放在一个可以全选复制的框里，只显示这一次。 */
function Result({ state }: { state: UserFormState }) {
  if (!state.error && !state.success) return null;
  return (
    <div role="status" className="mt-3 space-y-2 text-sm">
      {state.error && <p className="text-red-500">{state.error}</p>}
      {state.success && <p className="text-emerald-600 dark:text-emerald-400">{state.success}</p>}
      {state.password && (
        <input
          readOnly
          value={state.password}
          aria-label="一次性密码"
          onFocus={(event) => event.currentTarget.select()}
          className="h-10 w-full rounded-xl border border-emerald-500/40 bg-emerald-500/5 px-3 font-mono text-sm text-ink"
        />
      )}
    </div>
  );
}

function RoleSelect({ name, defaultValue, disabled, label }: { name: string; defaultValue: Role; disabled?: boolean; label: string }) {
  return (
    <select name={name} defaultValue={defaultValue} disabled={disabled} aria-label={label} className={inputCls}>
      {ROLE_ORDER.map((role) => (
        <option key={role} value={role}>
          {ROLES[role].label}
        </option>
      ))}
    </select>
  );
}

export function CreateUserForm() {
  const [state, action, pending] = useActionState<UserFormState, FormData>(createUser, {});
  return (
    <form action={action}>
      <div className="grid gap-3 sm:grid-cols-[1fr_1fr_8rem_auto] sm:items-end">
        <label className="block text-sm font-medium text-ink-2">
          用户名
          <input name="username" required minLength={3} maxLength={32} placeholder="登录用，如 zhangsan" className={`${inputCls} mt-1.5`} />
        </label>
        <label className="block text-sm font-medium text-ink-2">
          署名
          <input name="displayName" maxLength={20} placeholder="文章页显示，可留空" className={`${inputCls} mt-1.5`} />
        </label>
        <label className="block text-sm font-medium text-ink-2">
          角色
          <span className="mt-1.5 block">
            <RoleSelect name="role" defaultValue="author" label="新账号的角色" />
          </span>
        </label>
        <button
          type="submit"
          disabled={pending}
          className="h-10 rounded-full bg-btn px-5 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          {pending ? "创建中…" : "创建账号"}
        </button>
      </div>
      <Result state={state} />
    </form>
  );
}

export type UserRowData = {
  id: number;
  username: string;
  displayName: string | null;
  role: Role;
  twoFactor: boolean;
  tutorials: number;
  lastLogin: string | null;
  self: boolean;
};

export function UserRow({ user }: { user: UserRowData }) {
  const [saveState, saveAction, saving] = useActionState<UserFormState, FormData>(updateUser, {});
  const [resetState, resetAction, resetting] = useActionState<UserFormState, FormData>(resetUserPassword, {});
  const [deleteState, deleteAction, deleting] = useActionState<UserFormState, FormData>(deleteUser, {});
  const name = user.displayName || user.username;

  return (
    <li className="rounded-2xl border border-line bg-paper/40 p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="font-semibold text-ink">
          {user.username}
          {user.self && <span className="ml-2 rounded-full bg-accent-soft px-2 py-0.5 text-xs font-medium text-accent-ink">你</span>}
        </p>
        <p className="text-xs text-ink-3">
          {user.tutorials} 篇教程 · 两步验证{user.twoFactor ? "已开启" : "未开启"} · {user.lastLogin ? `最近一次登录 ${user.lastLogin}` : "目前没有登录中的设备"}
        </p>
      </div>

      <form action={saveAction} className="mt-3 grid gap-3 sm:grid-cols-[1fr_8rem_auto] sm:items-end">
        <input type="hidden" name="id" value={user.id} />
        <label className="block text-xs font-medium text-ink-2">
          署名
          <input
            name="displayName"
            defaultValue={user.displayName ?? ""}
            maxLength={20}
            placeholder="不显示署名"
            aria-label={`${user.username} 的署名`}
            className={`${inputCls} mt-1`}
          />
        </label>
        <label className="block text-xs font-medium text-ink-2">
          角色
          <span className="mt-1 block">
            {/* 自己的角色不能改（disabled 的字段不会提交，所以另放一个隐藏字段带上原值） */}
            <RoleSelect name="role" defaultValue={user.role} disabled={user.self} label={`${user.username} 的角色`} />
            {user.self && <input type="hidden" name="role" value={user.role} />}
          </span>
        </label>
        <button
          type="submit"
          disabled={saving}
          className="h-10 rounded-full border border-line px-4 text-sm text-ink-2 transition-colors hover:bg-surface hover:text-ink disabled:opacity-50"
        >
          {saving ? "保存中…" : "保存"}
        </button>
      </form>
      <Result state={saveState} />

      {!user.self && (
        <div className="mt-3 flex flex-wrap gap-2 border-t border-line pt-3">
          <form
            action={resetAction}
            onSubmit={(event) => {
              if (!confirm(`重置 ${user.username} 的密码？会同时关闭他的两步验证、删除通行密钥，并让他所有设备退出登录。`)) event.preventDefault();
            }}
          >
            <input type="hidden" name="id" value={user.id} />
            <button type="submit" disabled={resetting} className="rounded-lg px-3 py-1.5 text-xs text-ink-2 transition-colors hover:bg-surface hover:text-ink">
              {resetting ? "重置中…" : "重置密码"}
            </button>
          </form>
          <form
            action={deleteAction}
            onSubmit={(event) => {
              if (!confirm(`删除账号 ${user.username}？他写的 ${user.tutorials} 篇教程会转到你名下，署名随之改变。`)) event.preventDefault();
            }}
          >
            <input type="hidden" name="id" value={user.id} />
            <button type="submit" disabled={deleting} className="rounded-lg px-3 py-1.5 text-xs text-red-500 transition-colors hover:bg-red-500/10" aria-label={`删除账号 ${name}`}>
              {deleting ? "删除中…" : "删除账号"}
            </button>
          </form>
        </div>
      )}
      <Result state={resetState} />
      <Result state={deleteState} />
    </li>
  );
}
