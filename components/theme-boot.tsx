"use client";

import { useLayoutEffect } from "react";

/**
 * 根布局 <head> 里的主题脚本（#theme-script）只在服务端输出的 HTML 里执行。
 * 页面里调用 notFound()（文章、标签、系列、分类不存在，关于页没写内容）时，Next 只输出一个空壳
 * <html id="__next_error__">，整页改在浏览器里渲染，React 插入的 <script> 不会执行：深色模式失效、主题按钮点了没反应。
 * 这里在首次绘制前检查，脚本没执行过（没有 window.__siteTheme）就照原样补执行一次；正常页面什么都不做。
 */
export default function ThemeBoot() {
  useLayoutEffect(() => {
    if ((window as Window & { __siteTheme?: number }).__siteTheme) return;
    const source = document.getElementById("theme-script");
    if (!source?.textContent) return;
    const script = document.createElement("script");
    script.textContent = source.textContent;
    document.head.appendChild(script);
    script.remove();
  }, []);
  return null;
}
