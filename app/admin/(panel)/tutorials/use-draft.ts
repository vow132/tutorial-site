"use client";

import { useCallback, useEffect, useRef, useState, type RefObject } from "react";

/**
 * 编辑页自动保存草稿到本浏览器（localStorage）：会话过期、浏览器崩溃、误关页面都不丢稿。
 * - 每 3 秒对表单拍一次快照，和打开页面时的内容不同就存下来；
 * - 再次打开时，草稿比服务器上的版本新就提示恢复；
 * - 保存成功后服务端跳到 /admin/tutorials?saved=<key>，列表页据此清掉草稿（见 clear-draft.tsx）。
 *   保存失败（如会话过期被带去登录）时草稿保留。
 */
export type DraftValues = Record<string, string>;
type StoredDraft = { savedAt: string; values: DraftValues };

const FIELDS = ["title", "slug", "excerpt", "categoryId", "seriesId", "tags", "tagsPending", "cover", "content", "published", "publishAt"];
export const draftStorageKey = (key: string) => `tutorial-draft:${key}`;

export function snapshot(form: HTMLFormElement): DraftValues {
  const data = new FormData(form);
  const values: DraftValues = {};
  for (const field of FIELDS) values[field] = field === "published" ? (data.get(field) ? "on" : "") : String(data.get(field) ?? "");
  return values;
}

function read(key: string): StoredDraft | null {
  try {
    const raw = localStorage.getItem(draftStorageKey(key));
    return raw ? (JSON.parse(raw) as StoredDraft) : null;
  } catch {
    return null;
  }
}

function write(key: string, draft: StoredDraft | null) {
  try {
    if (draft) localStorage.setItem(draftStorageKey(key), JSON.stringify(draft));
    else localStorage.removeItem(draftStorageKey(key));
  } catch {
    // 隐私模式或存储已满：自动保存不可用，不影响正常保存
  }
}

/**
 * baseline：服务器上的版本（新建时是空白表单）对应的字段值。表单和它一样就没有草稿，
 * 不一样就存草稿——恢复草稿之后也一样，直到保存成功。
 */
export function useDraft(
  formRef: RefObject<HTMLFormElement | null>,
  key: string,
  baseline: DraftValues,
  serverUpdatedAt?: string,
) {
  /** 等用户决定是否恢复的草稿；决定之前不自动保存，免得覆盖它。 */
  const [pending, setPending] = useState<StoredDraft | null>(null);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const baselineJson = JSON.stringify(baseline);
  const last = useRef<string | null>(null);
  const decided = useRef(false);

  useEffect(() => {
    // localStorage 只在浏览器里有，放到挂载后读（服务端渲染时没有草稿）
    const timer = window.setTimeout(() => {
      const draft = read(key);
      const newer = draft && (!serverUpdatedAt || Date.parse(draft.savedAt) > Date.parse(serverUpdatedAt));
      if (draft && newer) setPending(draft);
      else {
        if (draft) write(key, null); // 服务器上的版本更新，草稿已过时
        decided.current = true;
      }
    }, 0);
    return () => window.clearTimeout(timer);
  }, [key, serverUpdatedAt]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      const form = formRef.current;
      // 编辑器是按需加载的，加载完之前表单里还没有正文字段
      if (!form || !decided.current || !form.elements.namedItem("content")) return;
      const current = JSON.stringify(snapshot(form));
      if (current === last.current) return;
      last.current = current;
      if (current === baselineJson) {
        write(key, null);
        setSavedAt(null);
        return;
      }
      const now = new Date().toISOString();
      write(key, { savedAt: now, values: JSON.parse(current) });
      setSavedAt(now);
    }, 3000);
    return () => window.clearInterval(timer);
  }, [formRef, key, baselineJson]);

  /** 恢复：返回草稿内容，由调用方用它重新挂载表单。 */
  const restore = useCallback(() => {
    const values = pending?.values ?? null;
    last.current = null;
    decided.current = true;
    setPending(null);
    return values;
  }, [pending]);

  const discard = useCallback(() => {
    write(key, null);
    decided.current = true;
    setPending(null);
  }, [key]);

  return { pending, savedAt, restore, discard };
}
