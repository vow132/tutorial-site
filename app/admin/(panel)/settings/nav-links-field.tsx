"use client";

import { useState } from "react";
import { MAX_NAV_LABEL, MAX_NAV_LINKS, type NavLinks } from "@/lib/settings-extras";
import { useAdminI18n } from "@/lib/i18n/client";

const inputCls =
  "h-9 w-full rounded-xl border border-line bg-surface px-3 text-sm outline-none transition-colors focus:border-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent/60";
const iconBtn = "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-ink-3 hover:bg-surface hover:text-ink disabled:opacity-30";

/** 站点设置「顶部导航链接」：增删、排序，放在分类前面或后面。提交时整组以 JSON 放在隐藏字段里。 */
export default function NavLinksField({ initial }: { initial: NavLinks }) {
  const [links, setLinks] = useState(initial.links);
  const { m, f } = useAdminI18n();
  const t = m.admin.settingsFields;
  const update = (index: number, patch: Partial<NavLinks["links"][number]>) =>
    setLinks((rows) => rows.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  const move = (index: number, dir: -1 | 1) =>
    setLinks((rows) => {
      const j = index + dir;
      if (j < 0 || j >= rows.length) return rows;
      const next = [...rows];
      [next[index], next[j]] = [next[j], next[index]];
      return next;
    });

  return (
    <div className="space-y-3">
      <input type="hidden" name="navLinks.links" value={JSON.stringify(links)} />
      {links.length === 0 && <p className="text-xs text-ink-3">{t.navEmpty}</p>}
      {links.map((link, i) => (
        <div key={i} className="flex flex-wrap items-center gap-2 rounded-2xl border border-line bg-paper/50 p-2.5 sm:flex-nowrap">
          <input
            value={link.label}
            onChange={(event) => update(i, { label: event.target.value })}
            placeholder={t.navLabelPlaceholder}
            aria-label={f(t.navLabel, { n: i + 1 })}
            maxLength={MAX_NAV_LABEL * 2}
            className={`${inputCls} sm:max-w-36`}
          />
          <input
            value={link.href}
            onChange={(event) => update(i, { href: event.target.value })}
            placeholder="/about 或 https://…"
            aria-label={f(t.navHref, { n: i + 1 })}
            className={`${inputCls} min-w-0 flex-1`}
          />
          <div className="ml-auto flex items-center">
            <button type="button" title={f(t.navUp, { n: i + 1 })} aria-label={f(t.navUp, { n: i + 1 })} disabled={i === 0} onClick={() => move(i, -1)} className={iconBtn}>
              ↑
            </button>
            <button type="button" title={f(t.navDown, { n: i + 1 })} aria-label={f(t.navDown, { n: i + 1 })} disabled={i === links.length - 1} onClick={() => move(i, 1)} className={iconBtn}>
              ↓
            </button>
            <button
              type="button"
              title={f(t.navRemove, { n: i + 1 })}
              aria-label={f(t.navRemove, { n: i + 1 })}
              onClick={() => setLinks((rows) => rows.filter((_, idx) => idx !== i))}
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-red-400 hover:bg-red-500/10"
            >
              ✕
            </button>
          </div>
        </div>
      ))}
      <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
        <button
          type="button"
          disabled={links.length >= MAX_NAV_LINKS}
          onClick={() => setLinks((rows) => [...rows, { label: "", href: "" }])}
          className="rounded-xl border border-dashed border-line px-4 py-2 text-sm font-medium text-ink-2 transition-colors hover:border-accent hover:text-accent disabled:opacity-40"
        >
          {t.navAdd}
        </button>
        <fieldset className="flex flex-wrap items-center gap-4 text-sm text-ink-2">
          <legend className="sr-only">{t.navPosition}</legend>
          <label className="flex items-center gap-2">
            <input type="radio" name="navLinks.position" value="before" defaultChecked={initial.position === "before"} className="h-4 w-4 accent-[var(--color-accent)]" />
            {t.navBefore}
          </label>
          <label className="flex items-center gap-2">
            <input type="radio" name="navLinks.position" value="after" defaultChecked={initial.position !== "before"} className="h-4 w-4 accent-[var(--color-accent)]" />
            {t.navAfter}
          </label>
        </fieldset>
      </div>
    </div>
  );
}
