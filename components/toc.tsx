"use client";

import { useEffect, useState } from "react";
import type { TocItem } from "@/lib/article";

/**
 * 跟随滚动的文章目录：IntersectionObserver 高亮当前小节。
 */
export default function Toc({ items }: { items: TocItem[] }) {
  const [active, setActive] = useState<string>(items[0]?.id ?? "");

  useEffect(() => {
    const headings = items
      .map((i) => document.getElementById(i.id))
      .filter((el): el is HTMLElement => !!el);
    if (headings.length === 0) return;

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) setActive(entry.target.id);
        }
      },
      { rootMargin: "-80px 0px -70% 0px", threshold: 0 }
    );
    headings.forEach((h) => observer.observe(h));
    return () => observer.disconnect();
  }, [items]);

  if (items.length === 0) return null;

  const jump = (e: React.MouseEvent, id: string) => {
    e.preventDefault();
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth" });
    history.replaceState(null, "", `#${id}`);
  };

  return (
    <nav className="sticky top-24 hidden lg:block">
      <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-ink-3">
        本页目录
      </p>
      <ul className="space-y-1 border-l border-line">
        {items.map((item) => (
          <li key={item.id}>
            <a
              href={`#${item.id}`}
              onClick={(e) => jump(e, item.id)}
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
  );
}
