"use client";

import { useEffect, useRef, useState } from "react";
import { useEditor, EditorContent, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Image from "@tiptap/extension-image";
import { Placeholder } from "@tiptap/extensions";

async function uploadImage(file: File): Promise<string> {
  const form = new FormData();
  form.append("file", file);
  const res = await fetch("/api/upload", { method: "POST", body: form });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? "上传失败");
  return data.url as string;
}

function insertFiles(editor: Editor, files: File[], pos?: number) {
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
            text: `⏳ 图片上传中…（${file.name}）#${placeholderId}`,
          },
        ],
      })
      .run();

    const replacePlaceholder = (content: object | string) => {
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

    uploadImage(file)
      .then((url) => {
        replacePlaceholder({
          type: "image",
          attrs: { src: url, alt: file.name },
        });
      })
      .catch((err) => {
        replacePlaceholder(`❌ 上传失败：${err.message ?? file.name}`);
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

export default function RichTextEditor({
  name,
  initialContent = "",
}: {
  name: string;
  initialContent?: string;
}) {
  const [html, setHtml] = useState(initialContent);
  const [dragging, setDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const lastInitialContent = useRef(initialContent);

  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({
        heading: { levels: [2, 3] },
        link: { openOnClick: false },
      }),
      Image.configure({ inline: false, allowBase64: false }),
      Placeholder.configure({
        placeholder: "开始撰写正文… 支持直接拖拽或粘贴图片",
      }),
    ],
    content: initialContent,
    onUpdate: ({ editor }) => setHtml(editor.getHTML()),
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
        if (editor) insertFiles(editor, files, pos);
        return true;
      },
      handlePaste: (_view, event) => {
        const files = Array.from(event.clipboardData?.files ?? []).filter(
          (f) => f.type.startsWith("image/")
        );
        if (files.length === 0) return false;
        event.preventDefault();
        if (editor) insertFiles(editor, files);
        return true;
      },
    },
  });

  // 在后台连续切换不同教程时，同步编辑器内容，避免残留上一篇正文。
  useEffect(() => {
    if (!editor) return;
    if (
      initialContent !== lastInitialContent.current &&
      initialContent !== editor.getHTML()
    ) {
      editor.commands.setContent(initialContent, { emitUpdate: false });
      setHtml(initialContent);
    }
    lastInitialContent.current = initialContent;
  }, [editor, initialContent]);

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

  if (!editor) {
    return (
      <textarea
        name={name}
        defaultValue={html}
        required
        aria-label="正文"
        placeholder="开始撰写正文…"
        className="min-h-[460px] w-full resize-y rounded-2xl border border-line bg-white px-5 py-4 font-mono text-sm leading-7 text-ink outline-none transition-colors focus:border-accent"
      />
    );
  }

  const setLink = () => {
    const prev = editor.getAttributes("link").href as string | undefined;
    const url = window.prompt("链接地址：", prev ?? "https://");
    if (url === null) return;
    if (url === "" || url === "https://") {
      editor.chain().focus().unsetLink().run();
    } else {
      editor.chain().focus().setLink({ href: url }).run();
    }
  };

  const pickImage = () => fileInputRef.current?.click();

  return (
    <div
      className={`tiptap-shell overflow-hidden rounded-2xl border bg-white transition-colors ${
        dragging ? "border-accent ring-2 ring-accent/20" : "border-line"
      }`}
    >
      {/* 工具栏 */}
      <div className="relative z-10 flex flex-wrap items-center gap-0.5 border-b border-line bg-white/95 px-2 py-1.5 backdrop-blur md:sticky md:top-4">
        <button
          type="button"
          title="撤销"
          onClick={() => editor.chain().focus().undo().run()}
          disabled={!editor.can().undo()}
          className={btn(false, !editor.can().undo())}
        >
          ↩
        </button>
        <button
          type="button"
          title="重做"
          onClick={() => editor.chain().focus().redo().run()}
          disabled={!editor.can().redo()}
          className={btn(false, !editor.can().redo())}
        >
          ↪
        </button>
        <Divider />
        <button
          type="button"
          title="标题 2"
          onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
          className={btn(editor.isActive("heading", { level: 2 }))}
        >
          H2
        </button>
        <button
          type="button"
          title="标题 3"
          onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
          className={btn(editor.isActive("heading", { level: 3 }))}
        >
          H3
        </button>
        <Divider />
        <button
          type="button"
          title="加粗"
          onClick={() => editor.chain().focus().toggleBold().run()}
          className={`${btn(editor.isActive("bold"))} font-bold`}
        >
          B
        </button>
        <button
          type="button"
          title="斜体"
          onClick={() => editor.chain().focus().toggleItalic().run()}
          className={`${btn(editor.isActive("italic"))} italic`}
        >
          I
        </button>
        <button
          type="button"
          title="下划线"
          onClick={() => editor.chain().focus().toggleUnderline().run()}
          className={`${btn(editor.isActive("underline"))} underline`}
        >
          U
        </button>
        <button
          type="button"
          title="删除线"
          onClick={() => editor.chain().focus().toggleStrike().run()}
          className={`${btn(editor.isActive("strike"))} line-through`}
        >
          S
        </button>
        <button
          type="button"
          title="行内代码"
          onClick={() => editor.chain().focus().toggleCode().run()}
          className={`${btn(editor.isActive("code"))} font-mono text-xs`}
        >
          {"</>"}
        </button>
        <Divider />
        <button
          type="button"
          title="无序列表"
          onClick={() => editor.chain().focus().toggleBulletList().run()}
          className={btn(editor.isActive("bulletList"))}
        >
          • 列表
        </button>
        <button
          type="button"
          title="有序列表"
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
          className={btn(editor.isActive("orderedList"))}
        >
          1. 列表
        </button>
        <button
          type="button"
          title="引用"
          onClick={() => editor.chain().focus().toggleBlockquote().run()}
          className={btn(editor.isActive("blockquote"))}
        >
          ❝ 引用
        </button>
        <button
          type="button"
          title="代码块"
          onClick={() => editor.chain().focus().toggleCodeBlock().run()}
          className={btn(editor.isActive("codeBlock"))}
        >
          代码块
        </button>
        <Divider />
        <button
          type="button"
          title="插入链接"
          onClick={setLink}
          className={btn(editor.isActive("link"))}
        >
          🔗
        </button>
        <button
          type="button"
          title="插入图片（也可直接拖入）"
          onClick={pickImage}
          className={btn(false)}
        >
          🖼 图片
        </button>
        <button
          type="button"
          title="分割线"
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
            <p className="rounded-full bg-white px-5 py-2 text-sm font-medium text-accent shadow">
              松开鼠标插入图片
            </p>
          </div>
        )}
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        multiple
        hidden
        onChange={(e) => {
          const files = Array.from(e.target.files ?? []);
          if (files.length) insertFiles(editor, files);
          e.target.value = "";
        }}
      />

      {/* 表单字段 */}
      <input type="hidden" name={name} value={html} />
    </div>
  );
}
