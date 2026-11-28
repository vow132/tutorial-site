"use client";

import { useActionState, useState } from "react";
import { updateSettings, type SettingsFormState } from "@/lib/actions/settings";
import type { SiteSettings, FooterColumn } from "@/lib/settings";
import { SEARCH_ENGINES } from "@/lib/search-verification";
import { submitKeepingValues } from "@/lib/form-submit";
import ImageField from "./image-field";
import AccentField from "./accent-field";
import NavLinksField from "./nav-links-field";
import AssetHostField from "./asset-host-field";
import CommentsField from "./comments-field";
import { useAdminI18n } from "@/lib/i18n/client";
import { LOCALE_NAMES, LOCALES } from "@/lib/i18n/locales";
import type { Messages } from "@/lib/i18n/messages/types";

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

export default function SettingsForm({
  settings,
  series,
  defaults: d,
}: {
  settings: SiteSettings;
  series: { slug: string; title: string; published: boolean }[];
  /** 输入框的占位文字：网站语言的默认文案 */
  defaults: Messages["defaults"];
}) {
  const [state, action, pending] = useActionState<SettingsFormState, FormData>(
    updateSettings,
    {}
  );
  const [columns, setColumns] = useState<FooterColumn[]>(settings.footerColumns);
  const { m } = useAdminI18n();
  const t = m.admin.settings;

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
      <Section title={t.basic} desc={t.basicHint}>
        <div>
          <label htmlFor="site-locale" className="mb-1.5 block text-sm font-medium text-ink-2">
            {t.locale}
          </label>
          <select id="site-locale" name="locale" defaultValue={settings.locale} className={`${inputCls} sm:max-w-xs`}>
            {LOCALES.map((locale) => (
              <option key={locale} value={locale}>
                {LOCALE_NAMES[locale]}
              </option>
            ))}
          </select>
          <p className="mt-1.5 text-xs text-ink-3">{t.localeHint}</p>
        </div>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <Field label={t.siteName} name="siteName" defaultValue={settings.siteName} placeholder={d.siteName} />
          <Field label={t.logoText} name="logoText" defaultValue={settings.logoText} placeholder={d.logoText} hint={t.logoTextHint} />
        </div>
        <Field
          label={t.siteTitle}
          name="siteTitle"
          defaultValue={settings.siteTitle}
          placeholder={d.siteTitle}
        />
        <Field
          label={t.siteDescription}
          name="siteDescription"
          defaultValue={settings.siteDescription}
          multiline
        />
      </Section>

      {/* ---------- 搜索引擎验证 ---------- */}
      <Section
        title={t.verification}
        desc={t.verificationHint}
      >
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {SEARCH_ENGINES.map((engine) => (
            <Field
              key={engine.key}
              label={m.admin.searchEngines[engine.key]}
              name={`verification.${engine.key}`}
              defaultValue={settings.verification[engine.key] ?? ""}
              placeholder={`<meta name="${engine.meta}" content="…">`}
            />
          ))}
        </div>
      </Section>

      {/* ---------- 安全联系方式 ---------- */}
      <Section
        title={t.security}
        desc={t.securityHint}
      >
        <Field
          label={t.securityContact}
          name="securityContact"
          defaultValue={settings.securityContact}
          placeholder={t.securityPlaceholder}
        />
      </Section>

      {/* ---------- 品牌 ---------- */}
      <Section title={t.brand} desc={t.brandHint}>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <ImageField name="brand.logoImage" label={t.logoImage} hint={t.logoImageHint} initial={settings.brand.logoImage} />
          <ImageField name="brand.favicon" label={t.favicon} hint={t.faviconHint} initial={settings.brand.favicon} />
          <ImageField name="brand.shareImage" label={t.shareImage} hint={t.shareImageHint} initial={settings.brand.shareImage} />
        </div>
        <AccentField initial={settings.brand.accentColor} logoText={settings.logoText} />
        <label className="flex items-center gap-2 text-sm text-ink-2">
          <input type="checkbox" name="brand.mascot" defaultChecked={settings.brand.mascot} className="h-4 w-4 accent-[var(--color-accent)]" />
          {t.mascot}
        </label>
      </Section>

      {/* ---------- 顶部导航 ---------- */}
      <Section
        title={t.nav}
        desc={t.navHint}
      >
        <NavLinksField initial={settings.navLinks} />
      </Section>

      {/* ---------- 图片加速 ---------- */}
      <Section
        title={t.assets}
        desc={t.assetsHint}
      >
        <AssetHostField initial={settings.assetHost} />
        <details className="text-xs leading-relaxed text-ink-3">
          <summary className="cursor-pointer text-ink-2">{t.assetsHow}</summary>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            {t.assetsSteps.map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ul>
        </details>
      </Section>

      {/* ---------- 首页 Hero ---------- */}
      <Section title={t.hero} desc={t.heroHint}>
        <Field label={t.heroBadge} name="heroBadge" defaultValue={settings.heroBadge} placeholder={d.heroBadge} />
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <Field label={t.heroTitleA} name="heroTitleA" defaultValue={settings.heroTitleA} placeholder={d.heroTitleA} />
          <Field label={t.heroTitleB} name="heroTitleB" defaultValue={settings.heroTitleB} placeholder={d.heroTitleB} />
          <Field label={t.heroAccent} name="heroAccent" defaultValue={settings.heroAccent} placeholder={d.heroAccent} />
        </div>
        <Field label={t.heroSubtitle} name="heroSubtitle" defaultValue={settings.heroSubtitle} multiline />
      </Section>

      {/* ---------- 从这里开始 ---------- */}
      <Section title={t.startHere} desc={t.startHereHint}>
        <label className="flex items-center gap-2 text-sm text-ink-2">
          <input type="checkbox" name="startHere.enabled" defaultChecked={settings.startHere.enabled} className="h-4 w-4 accent-[var(--color-accent)]" />
          {t.startHereEnabled}
        </label>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <Field label={t.startHereTitle} name="startHere.title" defaultValue={settings.startHere.title} placeholder={d.startHereTitle} />
          <div className="md:col-span-2">
            <Field label={t.startHereIntro} name="startHere.intro" defaultValue={settings.startHere.intro} placeholder={d.startHereIntro} />
          </div>
        </div>
        <fieldset>
          <legend className="mb-1.5 text-sm font-medium text-ink-2">
            {t.startHereSeries}
            <span className="ml-2 text-xs font-normal text-ink-3">{t.startHereSeriesHint}</span>
          </legend>
          {series.length === 0 ? (
            <p className="text-xs text-ink-3">{t.noSeries}</p>
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
                  {!item.published && <span className="text-xs text-ink-3">{t.seriesUnpublished}</span>}
                </label>
              ))}
            </div>
          )}
        </fieldset>
      </Section>

      {/* ---------- 文章页 ---------- */}
      <Section title={t.motion} desc={t.motionHint}>
        <div className="flex flex-wrap gap-5 text-sm text-ink-2">
          <label className="flex items-center gap-2">
            <input type="radio" name="articleMotion" value="calm" defaultChecked={settings.articleMotion === "calm"} className="h-4 w-4 accent-[var(--color-accent)]" />
            {t.motionCalm}
          </label>
          <label className="flex items-center gap-2">
            <input type="radio" name="articleMotion" value="full" defaultChecked={settings.articleMotion === "full"} className="h-4 w-4 accent-[var(--color-accent)]" />
            {t.motionFull}
          </label>
        </div>
      </Section>

      {/* ---------- 防爬 ---------- */}
      <Section
        title={t.antiScrape}
        desc={t.antiScrapeHint}
      >
        <label className="flex items-start gap-2 text-sm text-ink-2">
          <input
            type="checkbox"
            name="antiScrape.blockAiCrawlers"
            defaultChecked={settings.antiScrape.blockAiCrawlers}
            className="mt-0.5 h-4 w-4 shrink-0 accent-[var(--color-accent)]"
          />
          <span>
            {t.blockAi}
            <span className="mt-0.5 block text-xs text-ink-3">{t.blockAiHint}</span>
          </span>
        </label>
        <label className="flex items-start gap-2 text-sm text-ink-2">
          <input
            type="checkbox"
            name="antiScrape.copyAttribution"
            defaultChecked={settings.antiScrape.copyAttribution}
            className="mt-0.5 h-4 w-4 shrink-0 accent-[var(--color-accent)]"
          />
          <span>
            {t.copyAttribution}
            <span className="mt-0.5 block text-xs text-ink-3">{t.copyAttributionHint}</span>
          </span>
        </label>
      </Section>

      {/* ---------- 赞助与打赏 ---------- */}
      <Section title={t.support} desc={t.supportHint}>
        <Field label={t.donationText} name="support.donationText" defaultValue={settings.support.donationText} placeholder={t.donationPlaceholder} />
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <ImageField name="support.wechatQr" label={t.wechatQr} initial={settings.support.wechatQr} />
          <ImageField name="support.alipayQr" label={t.alipayQr} initial={settings.support.alipayQr} />
        </div>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <Field label={t.sponsorText} name="support.sponsorText" defaultValue={settings.support.sponsorText} placeholder={t.sponsorPlaceholder} />
          <Field label={t.sponsorUrl} name="support.sponsorUrl" defaultValue={settings.support.sponsorUrl} placeholder="https://example.com" hint={t.sponsorUrlHint} />
        </div>
        <ImageField name="support.sponsorImage" label={t.sponsorImage} hint={t.sponsorImageHint} initial={settings.support.sponsorImage} />
      </Section>

      {/* ---------- 评论 ---------- */}
      <Section
        title={t.comments}
        desc={t.commentsHint}
      >
        <CommentsField initial={settings.comments} />
      </Section>

      {/* ---------- 页脚 ---------- */}
      <Section title={t.footer}>
        <Field label={t.footerTagline} name="footerTagline" defaultValue={settings.footerTagline} multiline />
        <Field
          label={t.copyright}
          name="copyright"
          defaultValue={settings.copyright}
          placeholder={d.copyright}
          hint={t.copyrightHint}
        />
        <Field label={t.footerStatus} name="footerStatus" defaultValue={settings.footerStatus} placeholder={d.footerStatus} hint={t.footerStatusHint} />
      </Section>

      {/* ---------- 底部栏目 ---------- */}
      <Section
        title={t.columns}
        desc={t.columnsHint}
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
                  placeholder={t.columnTitle}
                  className={`${inputCls} max-w-52`}
                />
                <label className="flex shrink-0 cursor-pointer items-center gap-1.5 text-xs text-ink-2">
                  <input
                    type="checkbox"
                    checked={col.autoCategories ?? false}
                    onChange={(e) => updateCol(i, { autoCategories: e.target.checked })}
                    className="h-3.5 w-3.5 accent-accent"
                  />
                  {t.autoCategories}
                </label>
                <div className="ml-auto flex shrink-0 items-center gap-1">
                  <button
                    type="button"
                    title={t.moveUp}
                    aria-label={t.moveUp}
                    onClick={() => moveCol(i, -1)}
                    className="flex h-7 w-7 items-center justify-center rounded-lg text-ink-3 hover:bg-surface hover:text-ink"
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    title={t.moveDown}
                    aria-label={t.moveDown}
                    onClick={() => moveCol(i, 1)}
                    className="flex h-7 w-7 items-center justify-center rounded-lg text-ink-3 hover:bg-surface hover:text-ink"
                  >
                    ↓
                  </button>
                  <button
                    type="button"
                    title={t.removeColumn}
                    aria-label={t.removeColumn}
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
                        placeholder={t.linkLabel}
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
                        placeholder={t.linkHref}
                        className={`${inputCls} h-9 flex-1`}
                      />
                      <button
                        type="button"
                        onClick={() =>
                          updateCol(i, { links: col.links.filter((_, idx) => idx !== j) })
                        }
                        aria-label={t.removeLink}
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
                    {t.addLink}
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
          {t.addColumn}
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
          {pending ? m.admin.common.saving : t.submit}
        </button>
      </div>
    </form>
  );
}
