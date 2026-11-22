"use client";

import { useId, useState } from "react";
import type { ImportedTutorial } from "@/lib/markdown-import";

/**
 * 「从 Markdown 导入」：选 .md 文件或直接粘贴，转换后填进表单（还没保存，可以接着改）。
 * Markdown 解析库只在点「导入」时才加载。
 */
export default function MarkdownImport({
  onImport,
  hasContent,
}: {
  onImport: (values: ImportedTutorial) => void;
  hasContent: () => boolean;
}) {
  const [text, setText] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const fileId = useId();
  const textId = useId();

  const run = async (source: string) => {
    setError("");
    if (!source.trim()) {
      setError("内容是空的");
      return;
    }
    if (hasContent() && !confirm("导入会替换当前的正文；文件里有标题、摘要、标签时也会替换。继续吗？")) return;
    setBusy(true);
    try {
      const { markdownToTutorial } = await import("@/lib/markdown-import");
      const imported = markdownToTutorial(source);
      if (!imported.content) {
        setError("没有解析出正文");
        return;
      }
      onImport(imported);
      setText("");
    } catch {
      setError("解析失败，请确认是 Markdown 文本");
    } finally {
      setBusy(false);
    }
  };

  return (
    <details className="markdown-import mb-5 rounded-2xl border border-line bg-surface px-5 py-3">
      <summary className="cursor-pointer select-none text-sm font-medium text-ink-2 hover:text-ink">从 Markdown 导入</summary>
      <div className="mt-3 space-y-3 pb-1 text-sm">
        <p className="text-xs text-ink-3">
          支持开头的 front matter（title、slug、excerpt/description、tags）、代码块语言、表格，以及 GitHub 风格的提示框
          <code className="mx-1">{"> [!TIP]"}</code>。外链图片不会下载到本站，必要时请重新上传。
        </p>
        <div>
          <label htmlFor={fileId} className="mb-1 block text-xs text-ink-2">
            选择文件
          </label>
          <input
            id={fileId}
            type="file"
            accept=".md,.markdown,.txt,text/markdown,text/plain"
            disabled={busy}
            onChange={async (event) => {
              const file = event.currentTarget.files?.[0];
              event.currentTarget.value = "";
              if (!file) return;
              if (file.size > 2 * 1024 * 1024) {
                setError("文件太大（最多 2MB）");
                return;
              }
              await run(await file.text());
            }}
            className="block text-xs text-ink-2 file:mr-3 file:rounded-full file:border-0 file:bg-paper file:px-4 file:py-2 file:text-sm file:text-ink-2 hover:file:text-ink"
          />
        </div>
        <div>
          <label htmlFor={textId} className="mb-1 block text-xs text-ink-2">
            或者粘贴 Markdown
          </label>
          <textarea
            id={textId}
            rows={5}
            value={text}
            onChange={(event) => setText(event.target.value)}
            className="w-full rounded-xl border border-line bg-paper px-3 py-2 font-mono text-xs text-ink outline-none focus:border-accent"
          />
        </div>
        <div className="flex items-center gap-3">
          <button
            type="button"
            disabled={busy}
            onClick={() => run(text)}
            className="h-9 rounded-full border border-line px-4 text-sm font-medium text-ink-2 transition-colors hover:bg-paper hover:text-ink disabled:opacity-50"
          >
            {busy ? "导入中…" : "导入粘贴的内容"}
          </button>
          {error && (
            <span role="alert" className="text-xs text-red-500 dark:text-red-400">
              {error}
            </span>
          )}
        </div>
      </div>
    </details>
  );
}
