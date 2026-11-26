"use client";

import { useEffect, useRef, useState } from "react";

const MIN_HEIGHT = 240;
const MAX_HEIGHT = 20000;

const currentTheme = () => (document.documentElement.dataset.theme === "dark" ? "dark" : "light");

/**
 * 文末评论区：滚动到附近（提前约一屏）才插入 iframe 加载 /comments/frame（lib/comments.ts），
 * 不读评论的读者不用下载任何评论脚本。iframe 里的页面汇报高度，这里跟着调整；
 * 站点切换亮 / 暗主题时通知 iframe 一起换。只接受同源、来自这个 iframe 的消息。
 */
export default function Comments({ slug }: { slug: string }) {
  const sectionRef = useRef<HTMLElement>(null);
  const frameRef = useRef<HTMLIFrameElement>(null);
  const [src, setSrc] = useState<string | null>(null);
  const [height, setHeight] = useState(MIN_HEIGHT);

  useEffect(() => {
    const section = sectionRef.current;
    if (!section) return;
    const load = () => setSrc(`/comments/frame?${new URLSearchParams({ slug, theme: currentTheme() })}`);
    // 从 #comments 链接直接跳过来、或者不支持 IntersectionObserver 时立即加载
    if (location.hash === "#comments" || !("IntersectionObserver" in window)) return load();
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          observer.disconnect();
          load();
        }
      },
      { rootMargin: "800px 0px" },
    );
    observer.observe(section);
    return () => observer.disconnect();
  }, [slug]);

  useEffect(() => {
    if (!src) return;
    const onMessage = (event: MessageEvent) => {
      if (event.origin !== location.origin || event.source !== frameRef.current?.contentWindow) return;
      const data = event.data as { type?: string; height?: number } | null;
      if (data?.type === "comments:height" && typeof data.height === "number") {
        setHeight(Math.min(MAX_HEIGHT, Math.max(MIN_HEIGHT, Math.ceil(data.height))));
      }
    };
    window.addEventListener("message", onMessage);
    // 主题切换（components/theme-toggle.tsx 改的是 <html data-theme>）
    const observer = new MutationObserver(() => {
      frameRef.current?.contentWindow?.postMessage({ type: "comments:theme", theme: currentTheme() }, location.origin);
    });
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    return () => {
      window.removeEventListener("message", onMessage);
      observer.disconnect();
    };
  }, [src]);

  return (
    <section ref={sectionRef} id="comments" aria-labelledby="comments-heading" className="print-hide mt-14 scroll-mt-24">
      <h2 id="comments-heading" className="text-lg font-bold text-ink">
        评论
      </h2>
      <div className="mt-4" style={{ minHeight: MIN_HEIGHT }}>
        {src ? (
          <iframe
            ref={frameRef}
            src={src}
            title="评论区"
            // 允许评论组件运行脚本、读写自己的登录信息、弹出登录窗口；不允许它把整个页面跳走（除非读者点了登录链接）
            sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox allow-top-navigation-by-user-activation"
            referrerPolicy="strict-origin-when-cross-origin"
            className="block w-full border-0 bg-transparent"
            style={{ height }}
          />
        ) : (
          <p className="pt-6 text-sm text-ink-3">评论区加载中…</p>
        )}
      </div>
    </section>
  );
}
