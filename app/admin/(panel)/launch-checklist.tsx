import Link from "next/link";
import type { ChecklistItem } from "@/lib/launch-checklist";
import ClearSampleButton from "./clear-sample-button";

/** 仪表盘顶部的上线检查清单：没做完时展开，全部完成后收起成一行。 */
export default function LaunchChecklist({ items }: { items: ChecklistItem[] }) {
  const done = items.filter((item) => item.done).length;
  const complete = done === items.length;
  return (
    <details open={!complete} className="launch-checklist mt-6 rounded-3xl border border-line bg-surface p-5 sm:p-6">
      <summary className="cursor-pointer select-none text-base font-semibold text-ink">
        上线检查清单
        <span className={`ml-2 text-sm font-normal ${complete ? "text-emerald-600 dark:text-emerald-400" : "text-ink-3"}`}>
          {complete ? "全部完成 ✓" : `已完成 ${done} / ${items.length}`}
        </span>
      </summary>
      <ul className="mt-4 space-y-3">
        {items.map((item) => (
          <li key={item.key} className="flex gap-3 text-sm">
            <span
              aria-hidden="true"
              className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-xs ${
                item.done ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400" : "border border-line text-transparent"
              }`}
            >
              ✓
            </span>
            <div className="min-w-0 flex-1">
              <p className={item.done ? "text-ink-3" : "font-medium text-ink"}>
                <span className="sr-only">{item.done ? "已完成：" : "未完成："}</span>
                {item.label}
              </p>
              {!item.done && (
                <p className="mt-0.5 text-xs text-ink-3">
                  {item.hint}
                  {item.href && (
                    <Link href={item.href} className="ml-2 text-accent-ink hover:underline">
                      去设置 →
                    </Link>
                  )}
                </p>
              )}
              {!item.done && item.key === "samples" && <ClearSampleButton />}
            </div>
          </li>
        ))}
      </ul>
    </details>
  );
}
