"use client";

import { useActionState } from "react";
import { createUser, deleteUser, resetUserPassword, updateUser, type UserFormState } from "@/lib/actions/users";
import { ROLE_ORDER, type Role } from "@/lib/roles";
import { useAdminI18n } from "@/lib/i18n/client";

const inputCls =
  "h-10 w-full rounded-xl border border-line bg-surface px-3 text-sm outline-none transition-colors focus:border-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent/60";

/** 操作结果；新密码单独放在一个可以全选复制的框里，只显示这一次。 */
function Result({ state }: { state: UserFormState }) {
  const t = useAdminI18n().m.admin.users;
  if (!state.error && !state.success) return null;
  return (
    <div role="status" className="mt-3 space-y-2 text-sm">
      {state.error && <p className="text-red-500">{state.error}</p>}
      {state.success && <p className="text-emerald-600 dark:text-emerald-400">{state.success}</p>}
      {state.password && (
        <input
          readOnly
          value={state.password}
          aria-label={t.oneTimePassword}
          onFocus={(event) => event.currentTarget.select()}
          className="h-10 w-full rounded-xl border border-emerald-500/40 bg-emerald-500/5 px-3 font-mono text-sm text-ink"
        />
      )}
    </div>
  );
}

function RoleSelect({ name, defaultValue, disabled, label }: { name: string; defaultValue: Role; disabled?: boolean; label: string }) {
  const { m } = useAdminI18n();
  return (
    <select name={name} defaultValue={defaultValue} disabled={disabled} aria-label={label} className={inputCls}>
      {ROLE_ORDER.map((role) => (
        <option key={role} value={role}>
          {m.admin.roles[role].label}
        </option>
      ))}
    </select>
  );
}

export function CreateUserForm() {
  const [state, action, pending] = useActionState<UserFormState, FormData>(createUser, {});
  const t = useAdminI18n().m.admin.users;
  return (
    <form action={action}>
      <div className="grid gap-3 sm:grid-cols-[1fr_1fr_8rem_auto] sm:items-end">
        <label className="block text-sm font-medium text-ink-2">
          {t.username}
          <input name="username" required minLength={3} maxLength={32} placeholder={t.usernamePlaceholder} className={`${inputCls} mt-1.5`} />
        </label>
        <label className="block text-sm font-medium text-ink-2">
          {t.byline}
          <input name="displayName" maxLength={20} placeholder={t.bylinePlaceholder} className={`${inputCls} mt-1.5`} />
        </label>
        <label className="block text-sm font-medium text-ink-2">
          {t.role}
          <span className="mt-1.5 block">
            <RoleSelect name="role" defaultValue="author" label={t.newRole} />
          </span>
        </label>
        <button
          type="submit"
          disabled={pending}
          className="h-10 rounded-full bg-btn px-5 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          {pending ? t.creating : t.create}
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
  const { m, f, plural } = useAdminI18n();
  const t = m.admin.users;

  return (
    <li className="rounded-2xl border border-line bg-paper/40 p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="font-semibold text-ink">
          {user.username}
          {user.self && <span className="ml-2 rounded-full bg-accent-soft px-2 py-0.5 text-xs font-medium text-accent-ink">{t.you}</span>}
        </p>
        <p className="text-xs text-ink-3">
          {plural(user.tutorials, t.tutorials)} · {user.twoFactor ? t.twoFactorOn : t.twoFactorOff} ·{" "}
          {user.lastLogin ? f(t.lastLogin, { time: user.lastLogin }) : t.noSession}
        </p>
      </div>

      <form action={saveAction} className="mt-3 grid gap-3 sm:grid-cols-[1fr_8rem_auto] sm:items-end">
        <input type="hidden" name="id" value={user.id} />
        <label className="block text-xs font-medium text-ink-2">
          {t.byline}
          <input
            name="displayName"
            defaultValue={user.displayName ?? ""}
            maxLength={20}
            placeholder={t.noByline}
            aria-label={f(t.bylineOf, { name: user.username })}
            className={`${inputCls} mt-1`}
          />
        </label>
        <label className="block text-xs font-medium text-ink-2">
          {t.role}
          <span className="mt-1 block">
            {/* 自己的角色不能改（disabled 的字段不会提交，所以另放一个隐藏字段带上原值） */}
            <RoleSelect name="role" defaultValue={user.role} disabled={user.self} label={f(t.roleOf, { name: user.username })} />
            {user.self && <input type="hidden" name="role" value={user.role} />}
          </span>
        </label>
        <button
          type="submit"
          disabled={saving}
          className="h-10 rounded-full border border-line px-4 text-sm text-ink-2 transition-colors hover:bg-surface hover:text-ink disabled:opacity-50"
        >
          {saving ? m.admin.common.saving : m.admin.common.save}
        </button>
      </form>
      <Result state={saveState} />

      {!user.self && (
        <div className="mt-3 flex flex-wrap gap-2 border-t border-line pt-3">
          <form
            action={resetAction}
            onSubmit={(event) => {
              if (!confirm(f(t.resetConfirm, { name: user.username }))) event.preventDefault();
            }}
          >
            <input type="hidden" name="id" value={user.id} />
            <button type="submit" disabled={resetting} className="rounded-lg px-3 py-1.5 text-xs text-ink-2 transition-colors hover:bg-surface hover:text-ink">
              {resetting ? t.resetting : t.reset}
            </button>
          </form>
          <form
            action={deleteAction}
            onSubmit={(event) => {
              if (!confirm(plural(user.tutorials, t.deleteConfirm, { name: user.username }))) event.preventDefault();
            }}
          >
            <input type="hidden" name="id" value={user.id} />
            <button type="submit" disabled={deleting} className="rounded-lg px-3 py-1.5 text-xs text-red-500 transition-colors hover:bg-red-500/10" aria-label={f(t.deleteLabel, { name })}>
              {deleting ? m.admin.common.deleting : t.delete}
            </button>
          </form>
        </div>
      )}
      <Result state={resetState} />
      <Result state={deleteState} />
    </li>
  );
}
