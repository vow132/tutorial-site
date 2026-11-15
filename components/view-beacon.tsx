"use client";

import { useEffect } from "react";

/** 同一浏览器标签页 30 分钟内重复打开同一篇只上报一次（与服务端按 IP 去重一致）。 */
const DEDUPE_MS = 30 * 60 * 1000;

/**
 * 阅读量上报。文章页是缓存页，服务端渲染时拿不到访客信息，所以由浏览器在
 * 页面打开后发一次请求；不执行 JS 的爬虫天然不会计数。
 */
export default function ViewBeacon({ id }: { id: number }) {
  useEffect(() => {
    const key = `viewed:${id}`;
    try {
      const last = Number(sessionStorage.getItem(key));
      if (last && Date.now() - last < DEDUPE_MS) return;
      sessionStorage.setItem(key, String(Date.now()));
    } catch {
      // 隐私模式等禁用存储时照常上报，由服务端去重。
    }

    const body = JSON.stringify({ id });
    // sendBeacon 不占用主线程，页面立刻关闭也能送达；不支持时退回 keepalive 请求。
    const sent =
      typeof navigator.sendBeacon === "function" &&
      navigator.sendBeacon("/api/views", new Blob([body], { type: "application/json" }));
    if (!sent) {
      void fetch("/api/views", {
        method: "POST",
        body,
        headers: { "Content-Type": "application/json" },
        keepalive: true,
      }).catch(() => {});
    }
  }, [id]);

  return null;
}
