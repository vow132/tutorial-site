"use client";

import { useEffect } from "react";
import { draftStorageKey } from "./use-draft";

/** 保存成功跳回列表时（?saved=<key>）清掉该教程的本地草稿，并把地址栏里的参数去掉。 */
export default function ClearDraft({ draftKey }: { draftKey: string }) {
  useEffect(() => {
    try {
      localStorage.removeItem(draftStorageKey(draftKey));
    } catch {
      // ignore
    }
    const url = new URL(window.location.href);
    url.searchParams.delete("saved");
    window.history.replaceState(null, "", url.pathname + url.search);
  }, [draftKey]);
  return null;
}
