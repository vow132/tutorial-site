"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { COPY_ATTRIBUTION_MIN_LENGTH, copyAttribution } from "@/lib/anti-scrape";

/** 复制到剪贴板：HTTPS / localhost 用 Clipboard API，http 部署退回 execCommand。 */
async function copyText(text: string) {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // 继续尝试旧方法
  }
  const area = document.createElement("textarea");
  area.value = text;
  area.setAttribute("readonly", "");
  area.style.position = "fixed";
  area.style.opacity = "0";
  document.body.append(area);
  area.select();
  try {
    return document.execCommand("copy");
  } catch {
    return false;
  } finally {
    area.remove();
  }
}

type Zoom = { src: string; alt: string } | null;

/** 选区的这一端在代码块里 */
function inCode(node: Node | null) {
  const element = node instanceof Element ? node : node?.parentElement;
  return Boolean(element?.closest("pre, code, .code-block"));
}

/**
 * 文章正文是服务端渲染的静态 HTML（ISR 缓存页），交互统一在这里用事件委托接管：
 * 代码块「复制」、标题旁的 # 复制章节链接、点击图片放大，以及旧版 #h-0 式链接的兼容跳转。
 * 后台开了「复制正文时附上来源」（lib/anti-scrape.ts）时，复制一大段正文会在后面附上标题和原文链接；
 * 选区从代码块开始或结束、字数太少时不加（「复制」按钮走 Clipboard API，不触发 copy 事件）。
 */
export default function ArticleEnhancer({ attribution = null }: { attribution?: { title: string; url: string } | null }) {
  const [zoom, setZoom] = useState<Zoom>(null);
  const [toast, setToast] = useState<string | null>(null);
  const toastTimer = useRef(0);
  const closeRef = useRef<HTMLButtonElement>(null);

  const showToast = useCallback((message: string) => {
    setToast(message);
    window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(null), 1800);
  }, []);

  useEffect(() => {
    const article = document.querySelector<HTMLElement>(".article-body");
    if (!article) return;

    // 旧链接兼容：之前的标题 ID 是 h-0、h-1……，按顺序映射到现在的标题。
    const mapLegacyHash = () => {
      const legacy = /^#h-(\d+)$/.exec(window.location.hash);
      if (!legacy) return;
      const heading = article.querySelectorAll("h2[id], h3[id]")[Number(legacy[1])];
      if (heading) {
        history.replaceState(null, "", `#${heading.id}`);
        heading.scrollIntoView();
      }
    };
    mapLegacyHash();
    window.addEventListener("hashchange", mapLegacyHash);

    const onClick = async (event: MouseEvent) => {
      const target = event.target as HTMLElement;

      const copyButton = target.closest<HTMLButtonElement>("[data-copy-code]");
      if (copyButton) {
        const code = copyButton.closest(".code-block")?.querySelector("pre")?.textContent ?? "";
        const ok = await copyText(code.replace(/\n$/, ""));
        copyButton.textContent = ok ? "已复制" : "复制失败";
        window.setTimeout(() => (copyButton.textContent = "复制"), 1600);
        return;
      }

      const anchor = target.closest<HTMLAnchorElement>("a.heading-anchor");
      if (anchor) {
        event.preventDefault();
        const id = anchor.getAttribute("href")!.slice(1);
        history.replaceState(null, "", `#${id}`);
        document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
        const ok = await copyText(window.location.href);
        showToast(ok ? "已复制本节链接" : "复制失败，请从地址栏复制");
        return;
      }

      const image = target.closest<HTMLImageElement>("img");
      if (image && !image.closest("a")) {
        setZoom({ src: image.currentSrc || image.src, alt: image.alt });
      }
    };

    const onCopy = (event: ClipboardEvent) => {
      if (!attribution || !event.clipboardData) return;
      const selection = window.getSelection();
      if (!selection || selection.isCollapsed || selection.rangeCount === 0) return;
      const text = selection.toString();
      if (text.trim().length < COPY_ATTRIBUTION_MIN_LENGTH) return;
      if (inCode(selection.anchorNode) || inCode(selection.focusNode)) return;
      const copied = document.createElement("div");
      for (let i = 0; i < selection.rangeCount; i++) copied.append(selection.getRangeAt(i).cloneContents());
      const source = copyAttribution(attribution.title, attribution.url);
      event.clipboardData.setData("text/plain", text + source.text);
      event.clipboardData.setData("text/html", copied.innerHTML + source.html);
      event.preventDefault();
    };

    article.addEventListener("click", onClick);
    article.addEventListener("copy", onCopy);
    // 事件委托已经接上（hydration 完成）：端到端测试等这个标记再操作，不和 React 抢时间
    article.dataset.enhanced = "";
    return () => {
      article.removeEventListener("click", onClick);
      article.removeEventListener("copy", onCopy);
      window.removeEventListener("hashchange", mapLegacyHash);
      delete article.dataset.enhanced;
    };
  }, [showToast, attribution]);

  useEffect(() => {
    if (!zoom) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setZoom(null);
    };
    const previous = document.documentElement.style.overflow;
    document.documentElement.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);
    closeRef.current?.focus();
    return () => {
      document.documentElement.style.overflow = previous;
      window.removeEventListener("keydown", onKey);
    };
  }, [zoom]);

  return (
    <>
      {zoom && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={zoom.alt || "查看大图"}
          className="image-zoom fixed inset-0 z-[90] flex cursor-zoom-out items-center justify-center bg-black/80 p-4 backdrop-blur-sm"
          onClick={() => setZoom(null)}
        >
          {/* eslint-disable-next-line @next/next/no-img-element -- 正文图片是上传的静态文件，不走 next/image */}
          <img
            src={zoom.src}
            alt={zoom.alt}
            className="max-h-full max-w-full rounded-xl object-contain shadow-2xl"
          />
          <button
            ref={closeRef}
            type="button"
            onClick={() => setZoom(null)}
            className="absolute right-4 top-4 flex h-10 w-10 items-center justify-center rounded-full bg-white/15 text-xl text-white transition-colors hover:bg-white/25"
            aria-label="关闭大图"
          >
            ×
          </button>
        </div>
      )}
      <div
        role="status"
        aria-live="polite"
        className={`pointer-events-none fixed bottom-6 left-1/2 z-[95] -translate-x-1/2 rounded-full bg-btn px-4 py-2 text-sm font-medium text-white shadow-lifted transition-opacity duration-200 ${
          toast ? "opacity-100" : "opacity-0"
        }`}
      >
        {toast}
      </div>
    </>
  );
}
