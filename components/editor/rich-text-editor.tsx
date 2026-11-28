"use client";

import { useEffect, useRef, useState } from "react";
import { useEditor, EditorContent, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Image from "@tiptap/extension-image";
import { TextStyle } from "@tiptap/extension-text-style";
import { Color } from "@tiptap/extension-color";
import { Placeholder } from "@tiptap/extensions";
import { altFromFileName } from "@/lib/image-alt";
import MediaPicker from "./media-picker";
import { CALLOUT_TYPES } from "@/lib/callouts";
import { Callout } from "./callout";
import { ArticleTable } from "./table";
import { CODE_LANGUAGES } from "@/lib/code-languages";
import { useAdminI18n } from "@/lib/i18n/client";

type EditorText = ReturnType<typeof useAdminI18n>["m"]["admin"]["editor"];

async function uploadImage(file: File, e: EditorText): Promise<string> {
  const form = new FormData();
  form.append("file", file);
  const res = await fetch("/api/upload", { method: "POST", body: form });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? e.uploadFailed);
  return data.url as string;
}

function insertFiles(editor: Editor, files: File[], e: EditorText, pos?: number) {
  for (const file of files) {
    // 先插入占位文本（含唯一标识），上传完成后替换为图片
    const placeholderId = `upload-${Date.now()}-${Math.random()
      .toString(36)
      .slice(2, 8)}`;
    const at = pos ?? editor.state.selection.to;
    editor
      .chain()
      .insertContentAt(at, {
        type: "paragraph",
        content: [
          {
            type: "text",
            text: `${e.uploading.replace("{name}", file.name)} #${placeholderId}`,
          },
        ],
      })
      .run();

    const replacePlaceholder = (content: object | string) => {
      if (editor.isDestroyed) return;
      const { doc } = editor.state;
      let target: number | null = null;
      doc.descendants((node, p) => {
        if (node.isTextblock && node.textContent.includes(placeholderId)) {
          target = p;
          return false;
        }
        return true;
      });
      if (target === null) return;
      const from: number = target;
      const node = doc.nodeAt(from);
      const to = from + (node?.nodeSize ?? 1);
      editor.chain().insertContentAt({ from, to }, content as never).run();
    };

    uploadImage(file, e)
      .then((url) => {
        replacePlaceholder({
          type: "image",
          // 文件名有意义时直接用作说明；IMG_1234 之类留空，可用工具栏“图片说明”补上。
          attrs: { src: url, alt: altFromFileName(file.name) || null },
        });
      })
      .catch((err) => {
        replacePlaceholder(e.uploadError.replace("{reason}", err.message ?? file.name));
      });
  }
}

const btn = (active: boolean, disabled = false) =>
  `flex h-8 min-w-8 items-center justify-center rounded-lg px-2 text-sm transition-colors ${
    active
      ? "bg-accent-soft text-accent"
      : "text-ink-2 hover:bg-paper hover:text-ink"
  } ${disabled ? "cursor-not-allowed opacity-40" : ""}`;

function Divider() {
  return <span className="mx-1 h-5 w-px bg-line" />;
}

// 正文可选文字颜色（null 表示恢复默认色）
const TEXT_COLORS: { label: keyof EditorText["colors"]; value: string | null }[] = [
  { label: "default", value: null },
  { label: "red", value: "#e5484d" },
  { label: "orange", value: "#f76b15" },
  { label: "yellow", value: "#eab308" },
  { label: "green", value: "#30a46c" },
  { label: "teal", value: "#12a594" },
  { label: "blue", value: "#3b82f6" },
  { label: "purple", value: "#8b5cf6" },
  { label: "pink", value: "#e93d82" },
  { label: "gray", value: "#8b8d98" },
];

export default function RichTextEditor({
  name,
  initialContent = "",
  mediaLibrary = false,
}: {
  name: string;
  initialContent?: string;
  /** 显示「图片库」按钮：从上传过的图片里挑一张插入（需要图片库权限，lib/roles.ts） */
  mediaLibrary?: boolean;
}) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const e = useAdminI18n().m.admin.editor;
  // useEditor 只初始化一次：占位文字、拖入上传的提示从 ref 读，切换后台语言后也是新的
  const textRef = useRef(e);
  useEffect(() => {
    textRef.current = e;
  }, [e]);
  const [html, setHtml] = useState(initialContent);
  const [dragging, setDragging] = useState(false);
  const [colorOpen, setColorOpen] = useState(false);
  const [calloutOpen, setCalloutOpen] = useState(false);
  // 光标移进表格/代码块时工具栏要出现对应按钮：选区变化也重新渲染一次
  const [, setSelectionTick] = useState(0);
  const calloutRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const editorRef = useRef<Editor | null>(null);
  const colorRef = useRef<HTMLDivElement>(null);

  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({
        heading: { levels: [2, 3] },
        link: { openOnClick: false },
      }),
      TextStyle,
      Color,
      Image.configure({ inline: false, allowBase64: false }),
      Callout,
      ArticleTable,
      // 占位文字函数由 Tiptap 绘制时调用（不在 React 渲染期间），读到的是当前后台语言的文字
      // eslint-disable-next-line react-hooks/refs
      Placeholder.configure({
        placeholder: () => textRef.current.placeholder,
      }),
    ],
    content: initialContent,
    onCreate: ({ editor }) => {
      editorRef.current = editor;
    },
    onDestroy: () => {
      editorRef.current = null;
    },
    onUpdate: ({ editor }) => setHtml(editor.getHTML()),
    onSelectionUpdate: () => setSelectionTick((tick) => tick + 1),
    editorProps: {
      handleDrop: (view, event, _slice, moved) => {
        if (moved) return false;
        const files = Array.from(event.dataTransfer?.files ?? []).filter((f) =>
          f.type.startsWith("image/")
        );
        if (files.length === 0) return false;
        event.preventDefault();
        setDragging(false);
        const pos =
          view.posAtCoords({ left: event.clientX, top: event.clientY })?.pos ??
          view.state.selection.to;
        if (editorRef.current) insertFiles(editorRef.current, files, textRef.current, pos);
        return true;
      },
      handlePaste: (_view, event) => {
        const files = Array.from(event.clipboardData?.files ?? []).filter(
          (f) => f.type.startsWith("image/")
        );
        if (files.length === 0) return false;
        event.preventDefault();
        if (editorRef.current) insertFiles(editorRef.current, files, textRef.current);
        return true;
      },
    },
  });

  // 拖拽经过时高亮编辑区
  useEffect(() => {
    const el = document.querySelector(".tiptap-shell");
    if (!el) return;
    let depth = 0;
    const onDragEnter = (e: Event) => {
      if ((e as DragEvent).dataTransfer?.types.includes("Files")) {
        depth++;
        setDragging(true);
      }
    };
    const onDragLeave = () => {
      depth = Math.max(0, depth - 1);
      if (depth === 0) setDragging(false);
    };
    const onDrop = () => {
      depth = 0;
      setDragging(false);
    };
    el.addEventListener("dragenter", onDragEnter);
    el.addEventListener("dragleave", onDragLeave);
    el.addEventListener("drop", onDrop);
    return () => {
      el.removeEventListener("dragenter", onDragEnter);
      el.removeEventListener("dragleave", onDragLeave);
      el.removeEventListener("drop", onDrop);
    };
  }, []);

  // 点击调色板外部时关闭
  useEffect(() => {
    if (!colorOpen) return;
    const onClick = (e: MouseEvent) => {
      if (colorRef.current && !colorRef.current.contains(e.target as Node)) {
        setColorOpen(false);
      }
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [colorOpen]);

  // 点击提示框菜单外部时关闭
  useEffect(() => {
    if (!calloutOpen) return;
    const onClick = (e: MouseEvent) => {
      if (calloutRef.current && !calloutRef.current.contains(e.target as Node)) {
        setCalloutOpen(false);
      }
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [calloutOpen]);

  if (!editor) {
    return (
      <div className="rounded-2xl border border-line bg-surface">
        <div className="h-[460px] animate-pulse rounded-2xl bg-paper" />
        <input type="hidden" name={name} value={html} />
      </div>
    );
  }

  const setLink = () => {
    const prev = editor.getAttributes("link").href as string | undefined;
    const url = window.prompt(e.linkPrompt, prev ?? "https://");
    if (url === null) return;
    if (url === "" || url === "https://") {
      editor.chain().focus().unsetLink().run();
    } else {
      editor.chain().focus().setLink({ href: url }).run();
    }
  };

  const pickImage = () => fileInputRef.current?.click();

  // alt 文本：读屏软件朗读、图片加载失败时显示，也是搜索引擎理解图片的主要依据。
  const editImageAlt = () => {
    if (!editor.isActive("image")) {
      window.alert(e.selectImageFirst);
      return;
    }
    const prev = (editor.getAttributes("image").alt as string | undefined) ?? "";
    const alt = window.prompt(e.altPrompt, prev);
    if (alt === null) return;
    editor
      .chain()
      .focus()
      .updateAttributes("image", { alt: alt.trim().slice(0, 200) || null })
      .run();
  };

  const currentColor =
    (editor.getAttributes("textStyle").color as string | undefined) ?? null;
  const toRgb = (c: string) => {
    const div = document.createElement("div");
    div.style.color = c;
    document.body!.appendChild(div);
    const rgb = getComputedStyle(div).color;
    document.body!.removeChild(div);
    return rgb;
  };
  const rgbToHex = (rgb: string) => {
    const m = rgb.match(/^rgba?\((\d+),\s*(\d+),\s*(\d+)/);
    if (!m) return rgb;
    return `#${[m[1], m[2], m[3]].map(x => parseInt(x).toString(16).padStart(2, "0")).join("")}`;
  };
  const normalizedCurrent = currentColor ? toRgb(currentColor) : null;
  const hexCurrent = currentColor ? rgbToHex(normalizedCurrent!) : null;

  return (
    <div
      className={`tiptap-shell overflow-hidden rounded-2xl border bg-surface transition-colors ${
        dragging ? "border-accent ring-2 ring-accent/20" : "border-line"
      }`}
    >
      {/* 工具栏 */}
      {/*
        点工具栏按钮时不让按钮抢走焦点：光标留在正文里，接着就能打字。
        否则 Tiptap 要等下一帧才把焦点还给编辑器，期间按的键会落在按钮上（空格还会再按一次按钮）。
        下拉框和取色器需要焦点才能展开，不拦。
      */}
      <div
        onMouseDown={(event) => {
          if ((event.target as HTMLElement).closest("button")) event.preventDefault();
        }}
        className="sticky top-0 z-10 flex flex-wrap items-center gap-0.5 border-b border-line bg-surface/95 px-2 py-1.5 backdrop-blur"
      >
        <button
          type="button"
          title={e.undo}
          onClick={() => editor.chain().focus().undo().run()}
          disabled={!editor.can().undo()}
          className={btn(false, !editor.can().undo())}
        >
          ↩
        </button>
        <button
          type="button"
          title={e.redo}
          onClick={() => editor.chain().focus().redo().run()}
          disabled={!editor.can().redo()}
          className={btn(false, !editor.can().redo())}
        >
          ↪
        </button>
        <Divider />
        <button
          type="button"
          title={e.heading2}
          onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
          className={btn(editor.isActive("heading", { level: 2 }))}
        >
          H2
        </button>
        <button
          type="button"
          title={e.heading3}
          onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
          className={btn(editor.isActive("heading", { level: 3 }))}
        >
          H3
        </button>
        <Divider />
        <button
          type="button"
          title={e.bold}
          onClick={() => editor.chain().focus().toggleBold().run()}
          className={`${btn(editor.isActive("bold"))} font-bold`}
        >
          B
        </button>
        <button
          type="button"
          title={e.italic}
          onClick={() => editor.chain().focus().toggleItalic().run()}
          className={`${btn(editor.isActive("italic"))} italic`}
        >
          I
        </button>
        <button
          type="button"
          title={e.underline}
          onClick={() => editor.chain().focus().toggleUnderline().run()}
          className={`${btn(editor.isActive("underline"))} underline`}
        >
          U
        </button>
        <button
          type="button"
          title={e.strike}
          onClick={() => editor.chain().focus().toggleStrike().run()}
          className={`${btn(editor.isActive("strike"))} line-through`}
        >
          S
        </button>
        <button
          type="button"
          title={e.inlineCode}
          onClick={() => editor.chain().focus().toggleCode().run()}
          className={`${btn(editor.isActive("code"))} font-mono text-xs`}
        >
          {"</>"}
        </button>
        <Divider />
        <button
          type="button"
          title={e.bulletList}
          onClick={() => editor.chain().focus().toggleBulletList().run()}
          className={btn(editor.isActive("bulletList"))}
        >
          {e.bulletListShort}
        </button>
        <button
          type="button"
          title={e.orderedList}
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
          className={btn(editor.isActive("orderedList"))}
        >
          {e.orderedListShort}
        </button>
        <button
          type="button"
          title={e.quote}
          onClick={() => editor.chain().focus().toggleBlockquote().run()}
          className={btn(editor.isActive("blockquote"))}
        >
          {e.quoteShort}
        </button>
        <button
          type="button"
          title={e.codeBlock}
          onClick={() => editor.chain().focus().toggleCodeBlock().run()}
          className={btn(editor.isActive("codeBlock"))}
        >
          {e.codeBlock}
        </button>
        {/* 代码块语言：光标在代码块里时出现 */}
        {editor.isActive("codeBlock") && (
          <select
            aria-label={e.codeLanguage}
            value={(editor.getAttributes("codeBlock").language as string | null) ?? ""}
            onChange={(event) =>
              editor.chain().focus().updateAttributes("codeBlock", { language: event.target.value || null }).run()
            }
            className="h-8 rounded-lg border border-line bg-surface px-2 text-xs text-ink-2 outline-none focus:border-accent"
          >
            <option value="">{e.autoLanguage}</option>
            {Object.entries(CODE_LANGUAGES).map(([value, label]) => (
              <option key={value} value={value}>
                {value === "plaintext" ? e.plaintext : label}
              </option>
            ))}
          </select>
        )}
        <button
          type="button"
          title={e.insertTable}
          onClick={() => editor.chain().focus().insertTable({ rows: 3, cols: 3 }).run()}
          disabled={editor.isActive("table")}
          className={btn(false, editor.isActive("table"))}
        >
          {e.table}
        </button>
        {editor.isActive("table") && (
          <>
            <button type="button" title={e.addRow} onClick={() => editor.chain().focus().addRowAfter().run()} className={btn(false)}>
              {e.addRowShort}
            </button>
            <button type="button" title={e.addColumn} onClick={() => editor.chain().focus().addColumnAfter().run()} className={btn(false)}>
              {e.addColumnShort}
            </button>
            <button type="button" title={e.deleteRow} onClick={() => editor.chain().focus().deleteRow().run()} className={btn(false)}>
              {e.deleteRowShort}
            </button>
            <button type="button" title={e.deleteColumn} onClick={() => editor.chain().focus().deleteColumn().run()} className={btn(false)}>
              {e.deleteColumnShort}
            </button>
            <button type="button" title={e.deleteTable} onClick={() => editor.chain().focus().deleteTable().run()} className={`${btn(false)} text-red-500`}>
              {e.deleteTableShort}
            </button>
          </>
        )}
        {/* 提示框：提示 / 注意 / 警告 */}
        <div ref={calloutRef} className="relative">
          <button
            type="button"
            title={e.callout}
            aria-haspopup="menu"
            aria-expanded={calloutOpen}
            onClick={() => setCalloutOpen((v) => !v)}
            className={btn(calloutOpen || editor.isActive("callout"))}
          >
            {e.calloutShort}
          </button>
          {calloutOpen && (
            <div role="menu" className="absolute left-0 top-full z-20 mt-1 w-max rounded-xl border border-line bg-surface p-1 shadow-lg">
              {CALLOUT_TYPES.map((item) => (
                <button
                  key={item.value}
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    editor.chain().focus().toggleCallout(item.value).run();
                    setCalloutOpen(false);
                  }}
                  className={`flex w-full items-center gap-2 rounded-lg px-3 py-1.5 text-left text-sm transition-colors hover:bg-paper ${
                    editor.isActive("callout", { type: item.value }) ? "text-accent-ink" : "text-ink-2"
                  }`}
                >
                  <span aria-hidden="true">{item.icon}</span>
                  {e.calloutTypes[item.value]}
                </button>
              ))}
              {editor.isActive("callout") && (
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    editor.chain().focus().unsetCallout().run();
                    setCalloutOpen(false);
                  }}
                  className="mt-1 flex w-full items-center gap-2 rounded-lg border-t border-line px-3 py-1.5 text-left text-sm text-ink-3 transition-colors hover:bg-paper"
                >
                  {e.removeCallout}
                </button>
              )}
            </div>
          )}
        </div>
        {/* 文字颜色调色板 */}
        <div ref={colorRef} className="relative">
          <button
            type="button"
            title={e.textColor}
            onClick={() => setColorOpen((v) => !v)}
            className={btn(colorOpen || !!currentColor)}
          >
            <span
              className="h-4 w-4 rounded-full border border-line"
              style={{ backgroundColor: hexCurrent ?? "currentColor" }}
            />
          </button>
          {colorOpen && (
            <div className="absolute left-0 top-full z-20 mt-1 w-max rounded-xl border border-line bg-surface p-2 shadow-lg">
              <div className="grid grid-cols-5 gap-1">
                {TEXT_COLORS.map((c) => {
                  const active =
                    c.value === null ? !currentColor : normalizedCurrent === toRgb(c.value);
                  return (
                    <button
                      key={c.label}
                      type="button"
                      title={e.colors[c.label]}
                      aria-label={e.colors[c.label]}
                      onClick={() => {
                        const chain = editor.chain().focus();
                        if (c.value === null) chain.unsetColor().run();
                        else chain.setColor(c.value).run();
                        setColorOpen(false);
                      }}
                      className={`flex h-7 w-7 items-center justify-center rounded-lg border transition-transform hover:scale-110 ${
                        active ? "border-accent ring-2 ring-accent/30" : "border-line"
                      }`}
                      style={c.value ? { backgroundColor: c.value } : undefined}
                    >
                      {c.value === null && (
                        <span className="text-xs text-ink-3">✕</span>
                      )}
                    </button>
                  );
                })}
              </div>
              {/* 自定义取色器 */}
              <label className="mt-2 flex cursor-pointer items-center gap-2 border-t border-line pt-2 text-xs text-ink-2">
                <span
                  className="h-6 w-6 shrink-0 rounded-lg border border-line"
                  style={{ backgroundColor: hexCurrent ?? "#000000" }}
                />
                <span>{e.customColor}</span>
                <input
                  type="color"
                  value={hexCurrent ?? "#000000"}
                  onChange={(e) =>
                    editor.chain().focus().setColor(e.target.value).run()
                  }
                  className="ml-auto h-6 w-8 cursor-pointer rounded border border-line bg-transparent p-0"
                />
              </label>
            </div>
          )}
        </div>
        <Divider />
        <button
          type="button"
          title={e.insertLink}
          onClick={setLink}
          className={btn(editor.isActive("link"))}
        >
          🔗
        </button>
        <button
          type="button"
          title={e.insertImage}
          onClick={pickImage}
          className={btn(false)}
        >
          {e.image}
        </button>
        {mediaLibrary && (
          <button type="button" title={e.mediaLibraryHint} onClick={() => setPickerOpen(true)} className={btn(false)}>
            {e.mediaLibrary}
          </button>
        )}
        <button
          type="button"
          title={e.imageAltHint}
          onClick={editImageAlt}
          className={btn(false)}
        >
          {e.imageAlt}
        </button>
        <button
          type="button"
          title={e.divider}
          onClick={() => editor.chain().focus().setHorizontalRule().run()}
          className={btn(false)}
        >
          ―
        </button>
      </div>

      {/* 编辑区 */}
      <div className="relative">
        <EditorContent editor={editor} />
        {dragging && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-accent-soft/60">
            <p className="rounded-full bg-surface px-5 py-2 text-sm font-medium text-accent shadow">
              {e.dropHint}
            </p>
          </div>
        )}
      </div>

      {mediaLibrary && (
        <MediaPicker
          open={pickerOpen}
          onClose={() => setPickerOpen(false)}
          onPick={(url) => {
            setPickerOpen(false);
            editor.chain().focus().insertContent({ type: "image", attrs: { src: url, alt: null } }).run();
          }}
        />
      )}

      <input
        ref={fileInputRef}
        type="file"
        accept="image/png,image/jpeg,image/gif,image/webp"
        multiple
        hidden
        onChange={(event) => {
          const files = Array.from(event.target.files ?? []);
          if (files.length) insertFiles(editor, files, e);
          event.target.value = "";
        }}
      />

      {/* 表单字段 */}
      <input type="hidden" name={name} value={html} />
    </div>
  );
}
