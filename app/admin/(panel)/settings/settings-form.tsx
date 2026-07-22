"use client";

import { useActionState, useState } from "react";
import { updateSettings, type SettingsFormState } from "@/lib/actions/settings";
import type { SiteSettings, FooterColumn } from "@/lib/settings";

const inputCls =
  "h-10 w-full rounded-xl border border-line bg-white px-3.5 text-sm outline-none transition-colors focus:border-accent";

function Field({
  label,
  name,
  defaultValue,
  placeholder,
  hint,
  multiline = false,
}: {
  label: string;
  name: string;
  defaultValue: string;
  placeholder?: string;
  hint?: string;
  multiline?: boolean;
}) {
  return (
    <div>
      <label className="mb-1.5 block text-sm font-medium text-ink-2">
        {label}
        {hint && (
          <span className="ml-2 text-xs font-normal text-ink-3">{hint}</span>
        )}
      </label>
      {multiline ? (
        <textarea
          name={name}
          rows={2}
          defaultValue={defaultValue}
          placeholder={placeholder}
          className="w-full rounded-xl border border-line bg-white px-3.5 py-2.5 text-sm outline-none transition-colors focus:border-accent"
        />
      ) : (
        <input
          name={name}
          defaultValue={defaultValue}
          placeholder={placeholder}
          className={inputCls}
        />
      )}
    </div>
  );
}

function Section({
  title,
  desc,
  children,
}: {
  title: string;
  desc?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-3xl border border-line bg-white p-6">
      <h2 className="text-base font-bold text-ink">{title}</h2>
      {desc && <p className="mt-1 text-xs text-ink-3">{desc}</p>}
      <div className="mt-5 space-y-4">{children}</div>
    </section>
  );
}

export default function SettingsForm({ settings }: { settings: SiteSettings }) {
  const [state, action, pending] = useActionState<SettingsFormState, FormData>(
    updateSettings,
    {}
  );
  const [columns, setColumns] = useState<FooterColumn[]>(settings.footerColumns);

  const updateCol = (i: number, patch: Partial<FooterColumn>) =>
    setColumns((cols) => cols.map((c, idx) => (idx === i ? { ...c, ...patch } : c)));

  const moveCol = (i: number, dir: -1 | 1) =>
    setColumns((cols) => {
      const j = i + dir;
      if (j < 0 || j >= cols.length) return cols;
      const next = [...cols];
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });

  return (
    <form action={action} className="space-y-5">
      {/* ---------- 基本信息 ---------- */}
      <Section title="基本信息" desc="显示在浏览器标签页、导航 Logo 与搜索结果中">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <Field label="网站名称" name="siteName" defaultValue={settings.siteName} placeholder="教程网" />
          <Field label="Logo 字符" name="logoText" defaultValue={settings.logoText} placeholder="教" hint="1 个字符" />
        </div>
        <Field
          label="网站标题（SEO）"
          name="siteTitle"
          defaultValue={settings.siteTitle}
          placeholder="教程网 · 高质量图文教程"
        />
        <Field
          label="网站描述（SEO）"
          name="siteDescription"
          defaultValue={settings.siteDescription}
          multiline
        />
      </Section>

      {/* ---------- 首页 Hero ---------- */}
      <Section title="首页 Hero 文案" desc="首页顶部的大标题区域">
        <Field label="徽标文字" name="heroBadge" defaultValue={settings.heroBadge} placeholder="持续更新的知识库" />
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <Field label="标题第一行" name="heroTitleA" defaultValue={settings.heroTitleA} placeholder="把复杂的知识" />
          <Field label="标题第二行前缀" name="heroTitleB" defaultValue={settings.heroTitleB} placeholder="讲得" />
          <Field label="高亮词（彩色）" name="heroAccent" defaultValue={settings.heroAccent} placeholder="简单明白" />
        </div>
        <Field label="副标题" name="heroSubtitle" defaultValue={settings.heroSubtitle} multiline />
      </Section>

      {/* ---------- 页脚 ---------- */}
      <Section title="页脚">
        <Field label="品牌一句话" name="footerTagline" defaultValue={settings.footerTagline} multiline />
        <Field
          label="版权文字"
          name="copyright"
          defaultValue={settings.copyright}
          placeholder="教程网 · 用心写好每一篇教程"
          hint="年份会自动前置"
        />
      </Section>

      {/* ---------- 底部栏目 ---------- */}
      <Section
        title="底部栏目"
        desc="页脚的链接栏目，可增删排序；勾选「自动分类」后该栏目自动输出全部分类"
      >
        <input type="hidden" name="footerColumns" value={JSON.stringify(columns)} />
        <div className="space-y-3">
          {columns.map((col, i) => (
            <div key={i} className="rounded-2xl border border-line bg-paper/50 p-4">
              <div className="flex items-center gap-3">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-white text-xs font-bold text-ink-3 border border-line">
                  {i + 1}
                </span>
                <input
                  value={col.title}
                  onChange={(e) => updateCol(i, { title: e.target.value })}
                  placeholder="栏目标题"
                  className={`${inputCls} max-w-52`}
                />
                <label className="flex shrink-0 cursor-pointer items-center gap-1.5 text-xs text-ink-2">
                  <input
                    type="checkbox"
                    checked={col.autoCategories ?? false}
                    onChange={(e) => updateCol(i, { autoCategories: e.target.checked })}
                    className="h-3.5 w-3.5 accent-[#6366f1]"
                  />
                  自动分类
                </label>
                <div className="ml-auto flex shrink-0 items-center gap-1">
                  <button
                    type="button"
                    title="上移"
                    onClick={() => moveCol(i, -1)}
                    className="flex h-7 w-7 items-center justify-center rounded-lg text-ink-3 hover:bg-white hover:text-ink"
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    title="下移"
                    onClick={() => moveCol(i, 1)}
                    className="flex h-7 w-7 items-center justify-center rounded-lg text-ink-3 hover:bg-white hover:text-ink"
                  >
                    ↓
                  </button>
                  <button
                    type="button"
                    title="删除栏目"
                    onClick={() => setColumns((c) => c.filter((_, idx) => idx !== i))}
                    className="flex h-7 w-7 items-center justify-center rounded-lg text-red-400 hover:bg-red-50"
                  >
                    ✕
                  </button>
                </div>
              </div>

              {!col.autoCategories && (
                <div className="mt-3 space-y-2 pl-10">
                  {col.links.map((link, j) => (
                    <div key={j} className="flex items-center gap-2">
                      <input
                        value={link.label}
                        onChange={(e) =>
                          updateCol(i, {
                            links: col.links.map((l, idx) =>
                              idx === j ? { ...l, label: e.target.value } : l
                            ),
                          })
                        }
                        placeholder="文字"
                        className={`${inputCls} h-9 max-w-44`}
                      />
                      <input
                        value={link.href}
                        onChange={(e) =>
                          updateCol(i, {
                            links: col.links.map((l, idx) =>
                              idx === j ? { ...l, href: e.target.value } : l
                            ),
                          })
                        }
                        placeholder="链接，如 /tutorials 或 https://…"
                        className={`${inputCls} h-9 flex-1`}
                      />
                      <button
                        type="button"
                        onClick={() =>
                          updateCol(i, { links: col.links.filter((_, idx) => idx !== j) })
                        }
                        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-red-400 hover:bg-red-50"
                      >
                        ✕
                      </button>
                    </div>
                  ))}
                  <button
                    type="button"
                    onClick={() =>
                      updateCol(i, { links: [...col.links, { label: "", href: "" }] })
                    }
                    className="rounded-lg px-2.5 py-1.5 text-xs font-medium text-accent hover:bg-accent-soft"
                  >
                    + 添加链接
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
        <button
          type="button"
          onClick={() => setColumns((c) => [...c, { title: "", links: [] }])}
          className="rounded-xl border border-dashed border-line px-4 py-2.5 text-sm font-medium text-ink-2 transition-colors hover:border-accent hover:text-accent"
        >
          + 添加栏目
        </button>
      </Section>

      {/* ---------- 提交栏 ---------- */}
      <div className="sticky bottom-4 flex items-center justify-between rounded-2xl border border-line bg-white/95 px-5 py-4 shadow-lg backdrop-blur">
        <div className="text-sm">
          {state.error && <span className="text-red-500">{state.error}</span>}
          {state.success && <span className="text-emerald-600">{state.success}</span>}
        </div>
        <button
          type="submit"
          disabled={pending}
          className="rounded-full bg-ink px-8 py-2.5 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          {pending ? "保存中…" : "保存设置"}
        </button>
      </div>
    </form>
  );
}
