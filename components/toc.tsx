"use client";

import { useEffect, useState } from "react";
import type { TocItem } from "@/lib/article";

/** 跟随滚动的文章目录，并根据标题在视口中的位置高亮当前小节。 */
export default function Toc({ items }: { items: TocItem[] }) {
  const [active, setActive] = useState<string>(items[0]?.id ?? "");

  useEffect(() => {
    const headings = items
      .map((i) => document.getElementById(i.id))
      .filter((el): el is HTMLElement => !!el);
    if (headings.length === 0) return;

    let frame = 0;
    const updateActive = () => {
      frame = 0;
      const offset = Math.max(140, window.innerHeight * 0.45);
      let current = headings[0].id;
      for (const heading of headings) {
        if (heading.getBoundingClientRect().top <= offset) current = heading.id;
        else break;
      }
      setActive((previous) => (previous === current ? previous : current));
    };
    const onScroll = () => {
      if (!frame) frame = window.requestAnimationFrame(updateActive);
    };
    updateActive();
    document.addEventListener("scroll", onScroll, { capture: true, passive: true });
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      document.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, [items]);

  if (items.length === 0) return null;

  const jump = (e: React.MouseEvent, id: string) => {
    e.preventDefault();
    setActive(id);
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
    history.replaceState(null, "", `#${id}`);
  };

  return (
    <aside className="relative hidden min-w-0 self-stretch lg:block">
      <nav className="sticky top-24 max-h-[calc(100vh-7rem)] overflow-y-auto overscroll-contain pb-6" aria-label="本页目录">
        <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-ink-3">
          本页目录
        </p>
        <ul className="space-y-1 border-l border-line">
          {items.map((item) => (
            <li key={item.id}>
              <a
                href={`#${item.id}`}
                onClick={(e) => jump(e, item.id)}
                aria-current={active === item.id ? "location" : undefined}
                className={`-ml-px block border-l-2 py-1.5 pr-2 text-sm transition-all ${
                  item.level === 3 ? "pl-7" : "pl-4"
                } ${
                  active === item.id
                    ? "border-accent font-medium text-accent"
                    : "border-transparent text-ink-2 hover:text-ink"
                }`}
              >
                {item.text}
              </a>
            </li>
          ))}
        </ul>
      </nav>
    </aside>
  );
}
