"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import Link from "next/link";
import type { ImportCandidate } from "@/lib/bulk-import";
import { finishImport, importRemoteImage, importTutorial } from "@/lib/actions/tutorial-import";
import { useAdminI18n } from "@/lib/i18n/client";
import { rich } from "@/lib/i18n/rich";

type Category = { id: number; name: string; slug: string; label: string };
type Row = ImportCandidate & { selected: boolean };
type Loaded = { kind: "markdown" | "wordpress"; label: string; files: Map<string, File> };
type Result = {
  key: string;
  title: string;
  ok: boolean;
  id?: number;
  slug?: string;
  published?: boolean;
  error?: string;
  warnings: string[];
  oldPath: string | null;
};

const MAX_MARKDOWN_FILES = 2000;
const MAX_MARKDOWN_BYTES = 2 * 1024 * 1024;
const MAX_WXR_BYTES = 100 * 1024 * 1024;
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

type AdminI18n = ReturnType<typeof useAdminI18n>;
type Text = AdminI18n["m"]["admin"]["bulkImport"];

/** 选了什么：文件夹显示「文件夹名（N 个文件）」，一个文件显示文件名，多个显示个数。 */
function describeFiles(files: FileList | null, { m, plural }: AdminI18n) {
  if (!files?.length) return "";
  const t = m.admin.bulkImport;
  const folder = files[0].webkitRelativePath?.split("/")[0];
  if (folder) return plural(files.length, t.folderFiles, { folder });
  return files.length === 1 ? files[0].name : plural(files.length, t.files);
}

/**
 * 文件选择：原生文件框的按钮文字和样式随浏览器语言变（有的显示英文），换成和后台一致的按钮；
 * 真正的 <input type="file"> 只是视觉上隐藏，仍然可以用 Tab 聚焦、回车打开。
 */
function FilePicker({
  id,
  button,
  disabled,
  onFiles,
  ...input
}: {
  id: string;
  button: string;
  disabled: boolean;
  onFiles: (files: FileList | null) => Promise<void>;
} & Omit<React.InputHTMLAttributes<HTMLInputElement>, "id" | "type" | "onChange" | "disabled">) {
  const [chosen, setChosen] = useState("");
  const i18n = useAdminI18n();
  return (
    <div className="flex flex-wrap items-center gap-3">
      <input
        {...input}
        id={id}
        type="file"
        disabled={disabled}
        className="peer sr-only"
        onChange={(event) => {
          const element = event.currentTarget;
          const files = element.files;
          setChosen(describeFiles(files, i18n));
          // 清空以便再次选择同一个文件夹 / 文件时还能触发
          void onFiles(files).finally(() => (element.value = ""));
        }}
      />
      <label
        htmlFor={id}
        className="inline-flex h-9 cursor-pointer items-center rounded-full border border-line bg-surface px-4 text-sm font-medium text-ink-2 transition-colors hover:bg-paper hover:text-ink peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-accent peer-disabled:cursor-not-allowed peer-disabled:opacity-50"
      >
        {button}
      </label>
      <span className="min-w-0 truncate text-xs text-ink-3">{chosen || i18n.m.admin.bulkImport.nothingChosen}</span>
    </div>
  );
}

async function uploadFile(file: File, t: Text): Promise<{ url: string } | { error: string }> {
  if (file.size > MAX_IMAGE_BYTES) return { error: t.imageTooLarge };
  const body = new FormData();
  body.append("file", file);
  try {
    const response = await fetch("/api/upload", { method: "POST", body });
    const data = (await response.json().catch(() => ({}))) as { url?: string; error?: string };
    return response.ok && data.url ? { url: data.url } : { error: data.error ?? t.uploadFailedStatus.replace("{status}", String(response.status)) };
  } catch {
    return { error: t.uploadFailedNetwork };
  }
}

/**
 * 批量导入：选文件夹或 WordPress 导出文件 → 浏览器里解析、预览 → 逐篇导入（图片先传到本站）→ 结果和旧地址跳转规则。
 * 解析库只在选好文件后才加载。
 */
export default function BulkImport({ categories }: { categories: Category[] }) {
  const i18n = useAdminI18n();
  const { m, f, plural, date } = i18n;
  const t = m.admin.bulkImport;
  const formatDate = (iso: string | null) => (iso ? date(iso, { dateStyle: "medium", timeZone: undefined }) : "—");
  const ids = { folder: useId(), files: useId(), wxr: useId(), category: useId(), rules: useId() };
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [skipped, setSkipped] = useState<string[]>([]);
  const [error, setError] = useState("");
  const [parsing, setParsing] = useState(false);
  const [categoryId, setCategoryId] = useState(String(categories[0]?.id ?? ""));
  const [matchCategories, setMatchCategories] = useState(true);
  const [keepStatus, setKeepStatus] = useState(false);
  const [downloadRemote, setDownloadRemote] = useState(true);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0, current: "" });
  const [results, setResults] = useState<Result[] | null>(null);
  const [rules, setRules] = useState("");
  const [copied, setCopied] = useState(false);
  const stop = useRef(false);

  // 导入中关闭页面会中断：提醒一下
  useEffect(() => {
    if (!running) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [running]);

  const byName = useMemo(() => {
    const map = new Map<string, number>();
    for (const category of categories) {
      map.set(category.name.trim().toLowerCase(), category.id);
      if (category.slug) map.set(category.slug.toLowerCase(), category.id);
    }
    return map;
  }, [categories]);

  /** 原分类名和本站分类同名（或同网址别名）时放进对应分类，否则放进默认分类。 */
  const categoryFor = (row: ImportCandidate) => {
    if (matchCategories) {
      for (const name of row.categories) {
        const id = byName.get(name.trim().toLowerCase());
        if (id) return id;
      }
    }
    return Number(categoryId);
  };
  const categoryName = (id: number) => categories.find((category) => category.id === id)?.name ?? "";

  const reset = () => {
    setLoaded(null);
    setRows([]);
    setSkipped([]);
    setResults(null);
    setRules("");
    setError("");
  };

  const loadMarkdown = async (list: FileList | null, label: string) => {
    if (!list?.length) return;
    reset();
    setParsing(true);
    try {
      const { isImportableMarkdown, markdownFileToCandidate } = await import("@/lib/bulk-import");
      const files = new Map<string, File>();
      for (const file of Array.from(list)) files.set((file.webkitRelativePath || file.name).replace(/\\/g, "/"), file);
      const paths = [...files.keys()].filter(isImportableMarkdown).sort();
      if (paths.length === 0) {
        setError(t.noMarkdown);
        return;
      }
      if (paths.length > MAX_MARKDOWN_FILES) {
        setError(f(t.tooManyFiles, { n: paths.length, max: MAX_MARKDOWN_FILES }));
        return;
      }
      const items: Row[] = [];
      const skip: string[] = [];
      for (const path of paths) {
        const file = files.get(path)!;
        if (file.size > MAX_MARKDOWN_BYTES) {
          skip.push(f(t.skipTooLarge, { path }));
          continue;
        }
        const item = markdownFileToCandidate(path, await file.text(), file.lastModified);
        if (item.content) items.push({ ...item, selected: true });
        else skip.push(f(t.skipEmpty, { path }));
      }
      setLoaded({ kind: "markdown", label, files });
      setRows(items);
      setSkipped(skip);
    } catch {
      setError(t.markdownParseFailed);
    } finally {
      setParsing(false);
    }
  };

  const loadWordPress = async (file: File | undefined) => {
    if (!file) return;
    reset();
    if (file.size > MAX_WXR_BYTES) {
      setError(t.wxrTooLarge);
      return;
    }
    setParsing(true);
    try {
      const { parseWordPressExport } = await import("@/lib/bulk-import");
      const text = await file.text();
      if (!/<rss[\s>]/.test(text) || !/wordpress\.org\/export/.test(text)) {
        setError(t.notWxr);
        return;
      }
      const { items, skipped: skip, siteUrl } = parseWordPressExport(text, t);
      if (items.length === 0) {
        setError(t.wxrEmpty);
        return;
      }
      setLoaded({ kind: "wordpress", label: siteUrl ? `WordPress (${siteUrl})` : "WordPress", files: new Map() });
      setRows(items.map((item) => ({ ...item, selected: true })));
      setSkipped(skip);
    } catch {
      setError(t.wxrParseFailed);
    } finally {
      setParsing(false);
    }
  };

  const selected = rows.filter((row) => row.selected);

  const run = async () => {
    if (!loaded || selected.length === 0) return;
    if (!categoryId) {
      setError(t.chooseCategory);
      return;
    }
    setError("");
    setRunning(true);
    stop.current = false;
    const { isImageFile, nginxRedirectRules, replaceImageSources, resolveLocalImage } = await import("@/lib/bulk-import");
    const imagePaths = new Set([...loaded.files.keys()].filter(isImageFile));
    const stored = new Map<string, string>(); // 同一张图只传一次：本地路径 / 外链 → 本站地址
    const done: Result[] = [];
    let images = 0;
    setResults([]);

    for (let index = 0; index < selected.length && !stop.current; index++) {
      const row = selected[index];
      setProgress({ done: index, total: selected.length, current: row.title });
      const warnings: string[] = [];
      const replacements = new Map<string, string>();

      for (const src of row.images) {
        if (src.startsWith("/uploads/")) continue;
        const local = loaded.kind === "markdown" ? resolveLocalImage(src, row.key, imagePaths) : null;
        const remote = !local && /^(?:https?:)?\/\//i.test(src) ? (src.startsWith("//") ? `https:${src}` : src) : null;
        const cacheKey = local ? `file:${local}` : remote ?? src;
        let target = stored.get(cacheKey);
        if (!target) {
          if (local) {
            const result = await uploadFile(loaded.files.get(local)!, t);
            if ("url" in result) target = result.url;
            else warnings.push(f(t.imageFailed, { src, error: result.error }));
          } else if (remote) {
            if (!downloadRemote) continue;
            try {
              const result = await importRemoteImage(remote);
              if ("url" in result) target = result.url;
              else warnings.push(f(t.imageDownloadFailedReason, { src, error: result.error }));
            } catch {
              warnings.push(f(t.imageDownloadFailed, { src }));
            }
          } else if (!/^data:/i.test(src)) {
            warnings.push(f(t.imageMissing, { src }));
          }
          if (target) {
            stored.set(cacheKey, target);
            images++;
          }
        }
        if (target) replacements.set(src, target);
      }

      const published = keepStatus ? row.published : false;
      try {
        const result = await importTutorial({
          title: row.title,
          slug: row.slug,
          excerpt: row.excerpt,
          content: replaceImageSources(row.content, replacements),
          tags: row.tags,
          categoryId: categoryFor(row),
          published,
          createdAt: row.createdAt,
          updatedAt: row.updatedAt,
        });
        done.push(
          result.ok
            ? { key: row.key, title: row.title, ok: true, id: result.id, slug: result.slug, published, warnings, oldPath: row.oldPath }
            : { key: row.key, title: row.title, ok: false, error: result.error, warnings, oldPath: row.oldPath },
        );
      } catch (reason) {
        const message = reason instanceof Error && /body exceeded|too large|413/i.test(reason.message)
          ? t.bodyTooLarge
          : t.requestFailed;
        done.push({ key: row.key, title: row.title, ok: false, error: message, warnings, oldPath: row.oldPath });
      }
      setResults([...done]);
    }

    const created = done.filter((item) => item.ok);
    setProgress({ done: done.length, total: selected.length, current: "" });
    setRules(nginxRedirectRules(created.map((item) => ({ oldPath: item.oldPath, slug: item.slug! }))));
    try {
      await finishImport({
        created: created.length,
        failed: done.length - created.length,
        images,
        source: loaded.kind === "wordpress" ? "WordPress" : "Markdown",
        slugs: created.map((item) => item.slug!),
      });
    } catch {
      /* 前台缓存最多 1 分钟后也会刷新 */
    }
    setRunning(false);
  };

  const okCount = results?.filter((item) => item.ok).length ?? 0;
  const failCount = (results?.length ?? 0) - okCount;
  const finished = results !== null && !running;

  return (
    <div className="mt-6 space-y-6">
      {/* ---------- 第一步：选文件 ---------- */}
      {!running && !finished && (
        <section className="rounded-3xl border border-line bg-surface p-5 sm:p-6">
          <h2 className="text-base font-bold text-ink">{t.step1}</h2>
          <div className="mt-4 grid gap-4 md:grid-cols-3">
            <div className="rounded-2xl border border-line bg-paper/60 p-4">
              <label htmlFor={ids.folder} className="text-sm font-semibold text-ink">
                {t.folder}
              </label>
              <p className="mt-1 mb-3 text-xs leading-relaxed text-ink-3">
                {rich(t.folderHint, { source: <code>source</code>, content: <code>content</code>, static: <code>static</code>, posts: <code>_posts</code> })}
              </p>
              <FilePicker
                id={ids.folder}
                button={t.chooseFolder}
                multiple
                disabled={parsing}
                {...{ webkitdirectory: "", directory: "" }}
                onFiles={(files) => loadMarkdown(files, t.folderLabel)}
              />
            </div>
            <div className="rounded-2xl border border-line bg-paper/60 p-4">
              <label htmlFor={ids.files} className="text-sm font-semibold text-ink">
                {t.filesTitle}
              </label>
              <p className="mt-1 mb-3 text-xs leading-relaxed text-ink-3">{t.filesHint}</p>
              <FilePicker
                id={ids.files}
                button={t.chooseFiles}
                multiple
                accept=".md,.markdown,text/markdown"
                disabled={parsing}
                onFiles={(files) => loadMarkdown(files, t.filesLabel)}
              />
            </div>
            <div className="rounded-2xl border border-line bg-paper/60 p-4">
              <label htmlFor={ids.wxr} className="text-sm font-semibold text-ink">
                {t.wxr}
              </label>
              <p className="mt-1 mb-3 text-xs leading-relaxed text-ink-3">
                {t.wxrHint}
              </p>
              <FilePicker
                id={ids.wxr}
                button={t.chooseWxr}
                accept=".xml,application/xml,text/xml"
                disabled={parsing}
                onFiles={(files) => loadWordPress(files?.[0])}
              />
            </div>
          </div>
          {parsing && <p className="mt-4 text-sm text-ink-3">{t.parsing}</p>}
          {error && (
            <p role="alert" className="mt-4 text-sm text-red-500">
              {error}
            </p>
          )}
        </section>
      )}

      {/* ---------- 第二步：预览和选项 ---------- */}
      {loaded && rows.length > 0 && !running && !finished && (
        <section className="rounded-3xl border border-line bg-surface p-5 sm:p-6">
          <h2 className="text-base font-bold text-ink">{t.step2}</h2>
          <p className="mt-1 text-sm text-ink-3">
            {f(t.found, { label: loaded.label, n: rows.length, selected: selected.length })}
            {skipped.length > 0 && plural(skipped.length, t.skipped)}
          </p>
          {skipped.length > 0 && (
            <details className="mt-2 text-xs text-ink-3">
              <summary className="cursor-pointer">{t.showSkipped}</summary>
              <ul className="mt-1 list-disc pl-5">
                {skipped.slice(0, 50).map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </details>
          )}

          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <div>
              <label htmlFor={ids.category} className="mb-1.5 block text-sm font-medium text-ink-2">
                {t.defaultCategory}
              </label>
              <select
                id={ids.category}
                value={categoryId}
                onChange={(event) => setCategoryId(event.target.value)}
                className="h-10 w-full rounded-xl border border-line bg-surface px-3 text-sm outline-none focus:border-accent"
              >
                {categories.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.label}
                  </option>
                ))}
              </select>
              <label className="mt-2 flex items-center gap-2 text-sm text-ink-2">
                <input type="checkbox" checked={matchCategories} onChange={(event) => setMatchCategories(event.target.checked)} className="h-4 w-4" />
                {t.matchCategories}
              </label>
            </div>
            <fieldset className="space-y-2 text-sm text-ink-2">
              <legend className="mb-1.5 text-sm font-medium text-ink-2">{t.afterImport}</legend>
              <label className="flex items-center gap-2">
                <input type="radio" name="import-status" checked={!keepStatus} onChange={() => setKeepStatus(false)} className="h-4 w-4" />
                {t.allDrafts}
              </label>
              <label className="flex items-center gap-2">
                <input type="radio" name="import-status" checked={keepStatus} onChange={() => setKeepStatus(true)} className="h-4 w-4" />
                {t.keepStatus}
              </label>
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={downloadRemote} onChange={(event) => setDownloadRemote(event.target.checked)} className="h-4 w-4" />
                {t.downloadRemote}
              </label>
            </fieldset>
          </div>
          <p className="mt-3 text-xs text-ink-3">
            {t.keepsNote}
          </p>

          <div className="mt-4 max-h-[28rem] overflow-auto rounded-2xl border border-line">
            <table className="w-full text-left text-sm">
              <thead className="sticky top-0 bg-paper text-xs text-ink-3">
                <tr>
                  <th className="w-10 px-3 py-2">
                    <input
                      type="checkbox"
                      aria-label={t.selectAll}
                      checked={selected.length === rows.length}
                      onChange={(event) => setRows(rows.map((row) => ({ ...row, selected: event.target.checked })))}
                      className="h-4 w-4"
                    />
                  </th>
                  <th className="px-3 py-2 font-medium">{t.colTitle}</th>
                  <th className="px-3 py-2 font-medium">{t.colCategory}</th>
                  <th className="px-3 py-2 font-medium">{t.colTags}</th>
                  <th className="px-3 py-2 font-medium">{t.colDate}</th>
                  <th className="px-3 py-2 font-medium">{t.colStatus}</th>
                  <th className="px-3 py-2 font-medium">{t.colImages}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row, index) => (
                  <tr key={row.key} className="border-t border-line">
                    <td className="px-3 py-2">
                      <input
                        type="checkbox"
                        aria-label={f(t.importRow, { title: row.title })}
                        checked={row.selected}
                        onChange={(event) => setRows(rows.map((item, i) => (i === index ? { ...item, selected: event.target.checked } : item)))}
                        className="h-4 w-4"
                      />
                    </td>
                    <td className="max-w-[18rem] px-3 py-2">
                      <p className="truncate font-medium text-ink">{row.title}</p>
                      <p className="truncate text-xs text-ink-3">{row.source}</p>
                    </td>
                    <td className="px-3 py-2 text-ink-2">{categoryName(categoryFor(row))}</td>
                    <td className="max-w-[10rem] truncate px-3 py-2 text-xs text-ink-3">{row.tags.join(t.tagSeparator) || "—"}</td>
                    <td className="whitespace-nowrap px-3 py-2 text-xs text-ink-3">{formatDate(row.createdAt)}</td>
                    <td className="whitespace-nowrap px-3 py-2 text-xs text-ink-3">{row.published ? t.published : t.draft}</td>
                    <td className="px-3 py-2 text-xs text-ink-3">{row.images.length || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={run}
              disabled={selected.length === 0}
              className="h-10 rounded-full bg-btn px-6 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
            >
              {plural(selected.length, t.start)}
            </button>
            <button type="button" onClick={reset} className="text-sm text-ink-3 hover:text-ink">
              {t.rechoose}
            </button>
          </div>
        </section>
      )}

      {/* ---------- 第三步：进度和结果 ---------- */}
      {(running || finished) && (
        <section className="rounded-3xl border border-line bg-surface p-5 sm:p-6">
          <h2 className="text-base font-bold text-ink">{running ? t.running : t.finished}</h2>
          {running && (
            <div className="mt-3">
              <progress value={progress.done} max={progress.total} aria-label={t.progress} className="h-2 w-full accent-[var(--color-accent)]" />
              <p className="mt-2 text-sm text-ink-3">
                {progress.done} / {progress.total}：{progress.current}
              </p>
              <button type="button" onClick={() => (stop.current = true)} className="mt-2 text-sm text-red-500 hover:underline">
                {t.stop}
              </button>
            </div>
          )}
          {finished && (
            <p role="status" className="mt-2 text-sm text-ink-2">
              {plural(okCount, t.resultOk)}
              {failCount > 0 && plural(failCount, t.resultFailed)}
              {progress.done < progress.total && plural(progress.total - progress.done, t.resultStopped)}
              {t.resultEnd}
              {!keepStatus && okCount > 0 && t.resultDrafts}
            </p>
          )}

          {results && results.length > 0 && (
            <ul className="mt-4 max-h-[24rem] space-y-2 overflow-auto text-sm">
              {results.map((item) => (
                <li key={item.key} className="rounded-xl border border-line px-3 py-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={item.ok ? "text-emerald-600 dark:text-emerald-400" : "text-red-500"}>{item.ok ? "✓" : "✗"}</span>
                    {item.ok ? (
                      <Link href={`/admin/tutorials/${item.id}`} className="font-medium text-ink hover:underline">
                        {item.title}
                      </Link>
                    ) : (
                      <span className="font-medium text-ink">{item.title}</span>
                    )}
                    {item.ok && <span className="text-xs text-ink-3">/tutorials/{item.slug}</span>}
                    {!item.ok && <span className="text-xs text-red-500">{item.error}</span>}
                  </div>
                  {item.warnings.length > 0 && (
                    <ul className="mt-1 list-disc pl-6 text-xs text-amber-700 dark:text-amber-400">
                      {item.warnings.map((warning) => (
                        <li key={warning}>{warning}</li>
                      ))}
                    </ul>
                  )}
                </li>
              ))}
            </ul>
          )}

          {finished && rules && (
            <div className="mt-5">
              <label htmlFor={ids.rules} className="text-sm font-semibold text-ink">
                {t.rules}
              </label>
              <p className="mt-1 mb-2 text-xs leading-relaxed text-ink-3">
                {t.rulesHint}
              </p>
              <textarea id={ids.rules} readOnly value={rules} rows={Math.min(10, rules.split("\n").length)} className="w-full rounded-xl border border-line bg-paper p-3 font-mono text-xs text-ink-2" />
              <button
                type="button"
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(rules);
                    setCopied(true);
                    setTimeout(() => setCopied(false), 2000);
                  } catch {
                    /* 复制失败时用户可以手动选中复制 */
                  }
                }}
                className="mt-2 h-8 rounded-full border border-line px-4 text-xs text-ink-2 hover:bg-paper hover:text-ink"
              >
                {copied ? t.copied : t.copyRules}
              </button>
            </div>
          )}

          {finished && (
            <div className="mt-5 flex flex-wrap gap-3">
              <Link href="/admin/tutorials" className="flex h-10 items-center rounded-full bg-btn px-6 text-sm font-semibold text-white hover:opacity-90">
                {t.goTutorials}
              </Link>
              <button type="button" onClick={reset} className="text-sm text-ink-3 hover:text-ink">
                {t.importMore}
              </button>
            </div>
          )}
        </section>
      )}
    </div>
  );
}
