"use client";

import { useEffect } from "react";

/** 同一浏览器标签页 30 分钟内重复打开同一篇只上报一次（与服务端按 IP 去重一致）。 */
const DEDUPE_MS = 30 * 60 * 1000;

/**
 * 这个标签页里是否已经上报过：第一次打开文章时 document.referrer 才是真实来源；
 * 之后在站内点链接是客户端跳转，document.referrer 不会变，算作站内跳转。
 */
let reportedInThisTab = false;

/** 来源只取域名，不带路径和查询串（搜索词、站外页面地址都不上报）。 */
function referrerHost() {
  if (reportedInThisTab) return "(internal)";
  try {
    return document.referrer ? new URL(document.referrer).hostname : "";
  } catch {
    return "";
  }
}

/** 发一个 JSON 上报：sendBeacon 不占用主线程，页面立刻关闭也能送达；不支持时退回 keepalive 请求。 */
export function sendBeacon(payload: object) {
  const body = JSON.stringify(payload);
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
}

/**
 * 阅读量上报。文章页是缓存页，服务端渲染时拿不到访客信息，所以由浏览器在
 * 页面打开后发一次请求；不执行 JS 的爬虫天然不会计数。
 */
export default function ViewBeacon({ id }: { id: number }) {
  useEffect(() => {
    const ref = referrerHost();
    reportedInThisTab = true;
    const key = `viewed:${id}`;
    try {
      const last = Number(sessionStorage.getItem(key));
      if (last && Date.now() - last < DEDUPE_MS) return;
      sessionStorage.setItem(key, String(Date.now()));
    } catch {
      // 隐私模式等禁用存储时照常上报，由服务端去重。
    }
    sendBeacon({ id, ref });
  }, [id]);

  return null;
}
