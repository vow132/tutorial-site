"use client";

import { clearSampleData } from "@/lib/actions/sample-data";

export default function ClearSampleButton() {
  return (
    <form
      action={clearSampleData}
      onSubmit={(event) => {
        if (!confirm("删除种子数据里的 3 篇示例教程，以及已经没有教程的示例分类和标签？你自己建的内容不受影响。")) event.preventDefault();
      }}
      className="mt-2"
    >
      <button type="submit" className="h-8 rounded-full border border-line px-3 text-xs text-ink-2 transition-colors hover:bg-paper hover:text-ink">
        一键清除示例数据
      </button>
    </form>
  );
}
