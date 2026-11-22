"use client";

import { useEffect, useId, useRef, useState, useSyncExternalStore } from "react";

type Props = { url: string; title: string };

const canNativeShare = () => typeof navigator !== "undefined" && typeof navigator.share === "function";
const noopSubscribe = () => () => {};

/** 二维码矩阵画成一个 SVG path（深色模块是一个个 1×1 的小方块），留出 2 格白边。 */
function QrSvg({ modules }: { modules: boolean[][] }) {
  const size = modules.length + 4;
  let d = "";
  modules.forEach((row, y) =>
    row.forEach((dark, x) => {
      if (dark) d += `M${x + 2} ${y + 2}h1v1h-1z`;
    }),
  );
  return (
    <svg viewBox={`0 0 ${size} ${size}`} width="168" height="168" role="img" aria-label="本文地址的二维码" shapeRendering="crispEdges">
      <rect width={size} height={size} fill="#fff" />
      <path d={d} fill="#17181c" />
    </svg>
  );
}

async function copyText(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // 非 HTTPS 或浏览器拒绝时退回老办法
    const area = document.createElement("textarea");
    area.value = text;
    area.setAttribute("readonly", "");
    area.style.position = "fixed";
    area.style.opacity = "0";
    document.body.append(area);
    area.select();
    const ok = document.execCommand("copy");
    area.remove();
    return ok;
  }
}

/**
 * 文末分享：复制链接、微信扫码（电脑上看文章，手机扫码打开或转发）、手机上调用系统分享。
 * 二维码库只在点开时才加载，不增加文章页的首屏脚本。
 */
export default function ShareButtons({ url, title }: Props) {
  const native = useSyncExternalStore(noopSubscribe, canNativeShare, () => false);
  const [status, setStatus] = useState("");
  const [qr, setQr] = useState<boolean[][] | null>(null);
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const wrapper = useRef<HTMLDivElement>(null);
  const timer = useRef(0);

  useEffect(() => {
    if (!open) return;
    const close = (event: Event) => {
      if (event instanceof KeyboardEvent ? event.key === "Escape" : !wrapper.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("keydown", close);
    document.addEventListener("pointerdown", close);
    return () => {
      document.removeEventListener("keydown", close);
      document.removeEventListener("pointerdown", close);
    };
  }, [open]);

  useEffect(() => () => window.clearTimeout(timer.current), []);

  const flash = (message: string) => {
    setStatus(message);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setStatus(""), 2000);
  };

  const toggleQr = async () => {
    if (!qr) {
      const { default: qrcode } = await import("qrcode-generator");
      const code = qrcode(0, "M");
      code.addData(url);
      code.make();
      const count = code.getModuleCount();
      setQr(Array.from({ length: count }, (_, y) => Array.from({ length: count }, (_, x) => code.isDark(y, x))));
    }
    setOpen((value) => !value);
  };

  const button =
    "inline-flex h-9 items-center gap-1.5 rounded-full border border-line bg-paper px-4 text-sm text-ink-2 transition-colors hover:border-accent/60 hover:text-ink";

  return (
    <div ref={wrapper} className="share-buttons print-hide relative mt-6 flex flex-wrap items-center justify-center gap-2">
      <span className="text-sm text-ink-3">分享给朋友：</span>
      <button type="button" className={button} onClick={async () => flash((await copyText(url)) ? "链接已复制" : "复制失败，请手动复制地址栏")}>
        复制链接
      </button>
      <button type="button" className={button} onClick={toggleQr} aria-expanded={open} aria-controls={panelId}>
        微信扫码
      </button>
      {native && (
        <button
          type="button"
          className={button}
          onClick={() => navigator.share({ title, url }).catch(() => undefined)}
        >
          更多…
        </button>
      )}
      <span role="status" className="w-full text-center text-xs text-ink-3 empty:hidden">
        {status}
      </span>
      {open && qr && (
        <div
          id={panelId}
          className="absolute bottom-full left-1/2 z-20 mb-2 w-52 -translate-x-1/2 rounded-2xl border border-line bg-surface p-4 text-center shadow-capsule"
        >
          <div className="flex justify-center">
            <QrSvg modules={qr} />
          </div>
          <p className="mt-2 text-xs text-ink-3">微信扫一扫，在手机上打开或转发</p>
        </div>
      )}
    </div>
  );
}
