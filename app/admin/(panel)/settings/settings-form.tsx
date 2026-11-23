"use client";

import { useActionState, useState } from "react";
import { updateSettings, type SettingsFormState } from "@/lib/actions/settings";
import type { SiteSettings, FooterColumn } from "@/lib/settings";
import { SEARCH_ENGINES } from "@/lib/search-verification";
import { submitKeepingValues } from "@/lib/form-submit";
import ImageField from "./image-field";
import AccentField from "./accent-field";

const inputCls =
  "h-10 w-full rounded-xl border border-line bg-surface px-3.5 text-sm outline-none transition-colors focus:border-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent/60";

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
          className="w-full rounded-xl border border-line bg-surface px-3.5 py-2.5 text-sm outline-none transition-colors focus:border-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent/60"
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
    <section className="rounded-3xl border border-line bg-surface p-6">
      <h2 className="text-base font-bold text-ink">{title}</h2>
      {desc && <p className="mt-1 text-xs text-ink-3">{desc}</p>}
      <div className="mt-5 space-y-4">{children}</div>
    </section>
  );
}

export default function SettingsForm({ settings, series }: { settings: SiteSettings; series: { slug: string; title: string; published: boolean }[] }) {
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
    // 不用 action={action}：校验失败时 React 会重置表单，未保存的修改会丢失。
    <form onSubmit={submitKeepingValues(action)} className="space-y-5">
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

      {/* ---------- 搜索引擎验证 ---------- */}
      <Section
        title="搜索引擎验证"
        desc="在各站长平台选择「HTML 标签验证」，把验证码（或整段 meta 标签）粘贴到这里，保存后再回平台点验证；不用的留空"
      >
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {SEARCH_ENGINES.map((engine) => (
            <Field
              key={engine.key}
              label={engine.label}
              name={`verification.${engine.key}`}
              defaultValue={settings.verification[engine.key] ?? ""}
              placeholder={`<meta name="${engine.meta}" content="…">`}
            />
          ))}
        </div>
      </Section>

      {/* ---------- 安全联系方式 ---------- */}
      <Section
        title="安全联系方式"
        desc="安全研究人员发现漏洞时联系谁。填写后网站会提供标准的 /.well-known/security.txt；留空则不提供"
      >
        <Field
          label="邮箱或网址"
          name="securityContact"
          defaultValue={settings.securityContact}
          placeholder="security@example.com 或 https://example.com/security"
        />
      </Section>

      {/* ---------- 品牌 ---------- */}
      <Section title="品牌" desc="Logo、网站图标、分享图和主题色都在这里换，不用改仓库里的文件（改了文件会挡住一键更新）">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <ImageField name="brand.logoImage" label="Logo 图片" hint="正方形，留空用 Logo 字符" initial={settings.brand.logoImage} />
          <ImageField name="brand.favicon" label="网站图标" hint="正方形，至少 192×192" initial={settings.brand.favicon} />
          <ImageField name="brand.shareImage" label="默认分享图" hint="1200×630，留空自动生成" initial={settings.brand.shareImage} />
        </div>
        <AccentField initial={settings.brand.accentColor} logoText={settings.logoText} />
        <label className="flex items-center gap-2 text-sm text-ink-2">
          <input type="checkbox" name="brand.mascot" defaultChecked={settings.brand.mascot} className="h-4 w-4 accent-[var(--color-accent)]" />
          显示小幽灵吉祥物（导航上方、搜索无结果、404 页）
        </label>
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

      {/* ---------- 从这里开始 ---------- */}
      <Section title="首页「从这里开始」" desc="首页大标题下面的入门路线：展示几个系列和它们的第一篇，帮新读者找到起点">
        <label className="flex items-center gap-2 text-sm text-ink-2">
          <input type="checkbox" name="startHere.enabled" defaultChecked={settings.startHere.enabled} className="h-4 w-4 accent-[var(--color-accent)]" />
          在首页显示
        </label>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <Field label="标题" name="startHere.title" defaultValue={settings.startHere.title} placeholder="从这里开始" />
          <div className="md:col-span-2">
            <Field label="说明" name="startHere.intro" defaultValue={settings.startHere.intro} placeholder="不知道先看哪篇？挑一个系列，从第一篇读起。" />
          </div>
        </div>
        <fieldset>
          <legend className="mb-1.5 text-sm font-medium text-ink-2">
            展示哪些系列
            <span className="ml-2 text-xs font-normal text-ink-3">都不勾时自动展示最新的 3 个；最多 6 个，只显示有已发布教程的系列</span>
          </legend>
          {series.length === 0 ? (
            <p className="text-xs text-ink-3">还没有系列，可以在「教程系列」里创建。</p>
          ) : (
            <div className="flex flex-wrap gap-x-5 gap-y-2">
              {series.map((item) => (
                <label key={item.slug} className="flex items-center gap-2 text-sm text-ink-2">
                  <input
                    type="checkbox"
                    name="startHere.series"
                    value={item.slug}
                    defaultChecked={settings.startHere.seriesSlugs.includes(item.slug)}
                    className="h-4 w-4 accent-[var(--color-accent)]"
                  />
                  {item.title}
                  {!item.published && <span className="text-xs text-ink-3">（暂无已发布教程）</span>}
                </label>
              ))}
            </div>
          )}
        </fieldset>
      </Section>

      {/* ---------- 文章页 ---------- */}
      <Section title="文章页动效" desc="教程页面以阅读为主：精简时卡片不倾斜、没有聚光灯，吉祥物不跟随鼠标；首页等其他页面不受影响">
        <div className="flex flex-wrap gap-5 text-sm text-ink-2">
          <label className="flex items-center gap-2">
            <input type="radio" name="articleMotion" value="calm" defaultChecked={settings.articleMotion === "calm"} className="h-4 w-4 accent-[var(--color-accent)]" />
            精简（推荐）
          </label>
          <label className="flex items-center gap-2">
            <input type="radio" name="articleMotion" value="full" defaultChecked={settings.articleMotion === "full"} className="h-4 w-4 accent-[var(--color-accent)]" />
            完整（和首页一样）
          </label>
        </div>
      </Section>

      {/* ---------- 赞助与打赏 ---------- */}
      <Section title="赞助与打赏" desc="显示在每篇教程的文末；都留空时不显示。收款码请用自己的微信 / 支付宝「收款码」截图">
        <Field label="打赏按钮文字" name="support.donationText" defaultValue={settings.support.donationText} placeholder="觉得有用？请作者喝杯咖啡" />
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <ImageField name="support.wechatQr" label="微信收款码" initial={settings.support.wechatQr} />
          <ImageField name="support.alipayQr" label="支付宝收款码" initial={settings.support.alipayQr} />
        </div>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <Field label="赞助文字" name="support.sponsorText" defaultValue={settings.support.sponsorText} placeholder="本站由 某某云 赞助服务器" />
          <Field label="赞助链接" name="support.sponsorUrl" defaultValue={settings.support.sponsorUrl} placeholder="https://example.com" hint="会加上 rel=sponsored" />
        </div>
        <ImageField name="support.sponsorImage" label="赞助图片" hint="可选，横幅或 logo" initial={settings.support.sponsorImage} />
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
        <Field label="页脚状态文字" name="footerStatus" defaultValue={settings.footerStatus} placeholder="持续更新中" hint="留空不显示" />
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
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-surface text-xs font-bold text-ink-3 border border-line">
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
                    className="h-3.5 w-3.5 accent-accent"
                  />
                  自动分类
                </label>
                <div className="ml-auto flex shrink-0 items-center gap-1">
                  <button
                    type="button"
                    title="上移"
                    onClick={() => moveCol(i, -1)}
                    className="flex h-7 w-7 items-center justify-center rounded-lg text-ink-3 hover:bg-surface hover:text-ink"
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    title="下移"
                    onClick={() => moveCol(i, 1)}
                    className="flex h-7 w-7 items-center justify-center rounded-lg text-ink-3 hover:bg-surface hover:text-ink"
                  >
                    ↓
                  </button>
                  <button
                    type="button"
                    title="删除栏目"
                    onClick={() => setColumns((c) => c.filter((_, idx) => idx !== i))}
                    className="flex h-7 w-7 items-center justify-center rounded-lg text-red-400 hover:bg-red-500/10"
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
                        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-red-400 hover:bg-red-500/10"
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
      <div className="sticky bottom-4 flex items-center justify-between rounded-2xl border border-line bg-surface/95 px-5 py-4 shadow-lg backdrop-blur">
        <div className="text-sm">
          {state.error && <span className="text-red-500">{state.error}</span>}
          {state.success && <span className="text-emerald-600">{state.success}</span>}
        </div>
        <button
          type="submit"
          disabled={pending}
          className="rounded-full bg-btn px-8 py-2.5 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          {pending ? "保存中…" : "保存设置"}
        </button>
      </div>
    </form>
  );
}
