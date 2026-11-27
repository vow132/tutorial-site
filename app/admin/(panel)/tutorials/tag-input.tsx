"use client";

import { useId, useState } from "react";
import { MAX_TAGS_PER_TUTORIAL, normalizeTagName, tagSlug } from "@/lib/tags";
import { useAdminI18n } from "@/lib/i18n/client";

/**
 * 标签输入：回车或逗号确认成标签，退格删除最后一个；输入时按已有标签给出建议。
 * 确认后的标签放在隐藏字段 tags 里；输入框里还没确认的文字以 tagsPending 一起提交，服务端合并。
 */
export default function TagInput({ initial, suggestions }: { initial: string[]; suggestions: string[] }) {
  const { m, f } = useAdminI18n();
  const t = m.admin.tutorials;
  const [tags, setTags] = useState(initial);
  const [text, setText] = useState("");
  const listId = useId();
  const inputId = useId();

  const commit = (raw: string) => {
    const next = [...tags];
    for (const part of raw.split(/[,，、;；\n]+/)) {
      const name = normalizeTagName(part);
      const slug = tagSlug(name);
      if (!name || !slug || next.some((tag) => tagSlug(tag) === slug)) continue;
      next.push(name);
    }
    setTags(next.slice(0, MAX_TAGS_PER_TUTORIAL));
    setText("");
  };

  const used = new Set(tags.map(tagSlug));

  return (
    <div>
      <label htmlFor={inputId} className="mb-1.5 block text-sm font-medium text-ink-2">
        {t.tags}
        <span className="ml-2 text-xs font-normal text-ink-3">{f(t.tagsHint, { n: MAX_TAGS_PER_TUTORIAL })}</span>
      </label>
      <input type="hidden" name="tags" value={tags.join(",")} />
      <div className="flex min-h-11 flex-wrap items-center gap-2 rounded-xl border border-line bg-surface px-3 py-2 focus-within:border-accent">
        {tags.map((tag) => (
          <span key={tag} className="inline-flex items-center gap-1 rounded-full bg-accent-soft px-3 py-1 text-xs font-medium text-accent-ink">
            #{tag}
            <button
              type="button"
              onClick={() => setTags(tags.filter((item) => item !== tag))}
              className="ml-0.5 rounded-full px-1 text-ink-3 transition-colors hover:text-red-500"
              aria-label={f(t.removeTag, { tag })}
            >
              ×
            </button>
          </span>
        ))}
        <input
          id={inputId}
          name="tagsPending"
          value={text}
          list={listId}
          disabled={tags.length >= MAX_TAGS_PER_TUTORIAL}
          placeholder={tags.length >= MAX_TAGS_PER_TUTORIAL ? t.tagsFull : tags.length ? t.tagsMore : t.tagsPlaceholder}
          onChange={(event) => {
            const value = event.target.value;
            if (/[,，、;；]/.test(value)) commit(value);
            else setText(value);
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              if (text.trim()) commit(text);
            } else if (event.key === "Backspace" && !text && tags.length) {
              setTags(tags.slice(0, -1));
            }
          }}
          onBlur={() => text.trim() && commit(text)}
          className="h-7 min-w-32 flex-1 bg-transparent text-sm outline-none placeholder:text-ink-3"
        />
        <datalist id={listId}>
          {suggestions
            .filter((name) => !used.has(tagSlug(name)))
            .map((name) => (
              <option key={name} value={name} />
            ))}
        </datalist>
      </div>
    </div>
  );
}
